//! CONNECT-only broker. Resolve once, reject every non-public answer, then connect
//! to that exact SocketAddr. Redirects cause new CONNECT checks, not fresh DNS in the engine.
use crate::{
    error::{AppError, Result},
    security::public_ip,
};
use std::{sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{lookup_host, TcpListener, TcpStream},
    sync::{watch, Semaphore},
};

pub struct NetworkBroker {
    pub address: String,
    stop: watch::Sender<bool>,
}
impl Drop for NetworkBroker {
    fn drop(&mut self) {
        let _ = self.stop.send(true);
    }
}
impl NetworkBroker {
    pub async fn start() -> Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let address = format!("http://{}", listener.local_addr()?);
        let (stop, mut rx) = watch::channel(false);
        let permits = Arc::new(Semaphore::new(12));
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = rx.changed() => break,
                    accepted = listener.accept() => {
                        let Ok((stream, _)) = accepted else { break; };
                        let Ok(permit) = permits.clone().try_acquire_owned() else { continue; };
                        let mut child_stop = rx.clone();
                        tokio::spawn(async move {
                            let _permit = permit;
                            tokio::select! {
                                _ = child_stop.changed() => {},
                                _ = tokio::time::timeout(Duration::from_secs(3600), tunnel(stream)) => {},
                            }
                        });
                    }
                }
            }
        });
        Ok(Self { address, stop })
    }
}
async fn tunnel(mut input: TcpStream) -> Result<()> {
    let mut header = Vec::new();
    tokio::time::timeout(Duration::from_secs(10), async {
        while !header.ends_with(b"\r\n\r\n") {
            if header.len() >= 8192 {
                return Err(AppError::new(
                    "NETWORK_ERROR",
                    "Requête réseau trop volumineuse.",
                ));
            }
            header.push(input.read_u8().await?);
        }
        Ok(())
    })
    .await
    .map_err(|_| AppError::new("NETWORK_ERROR", "Délai réseau dépassé."))??;
    let text = std::str::from_utf8(&header).map_err(AppError::internal)?;
    let mut first = text.lines().next().unwrap_or("").split_whitespace();
    if first.next() != Some("CONNECT") {
        input.write_all(b"HTTP/1.1 403 Forbidden\r\n\r\n").await?;
        return Ok(());
    }
    let target = first.next().unwrap_or("");
    let Some(host) = target.strip_suffix(":443") else {
        return Ok(());
    };
    if host.is_empty() || host.contains(['/', '@', '#', '?']) {
        return Ok(());
    }
    let addresses = tokio::time::timeout(Duration::from_secs(10), lookup_host(target))
        .await
        .map_err(|_| AppError::new("NETWORK_ERROR", "Résolution réseau trop longue."))??
        .collect::<Vec<_>>();
    if addresses.is_empty() || addresses.iter().any(|a| !public_ip(a.ip())) {
        input.write_all(b"HTTP/1.1 403 Forbidden\r\n\r\n").await?;
        return Ok(());
    }
    let mut output = tokio::time::timeout(
        Duration::from_secs(15),
        TcpStream::connect(addresses.as_slice()),
    )
    .await
    .map_err(|_| AppError::new("NETWORK_ERROR", "Connexion trop longue."))??;
    input
        .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        .await?;
    tokio::io::copy_bidirectional(&mut input, &mut output).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn broker_blocks_private_and_plain_http() {
        let broker = NetworkBroker::start().await.unwrap();
        let address = broker.address.trim_start_matches("http://");
        for request in [
            "CONNECT 127.0.0.1:443 HTTP/1.1\r\n\r\n",
            "GET http://example.com/ HTTP/1.1\r\n\r\n",
        ] {
            let mut socket = TcpStream::connect(address).await.unwrap();
            socket.write_all(request.as_bytes()).await.unwrap();
            let mut response = Vec::new();
            socket.read_to_end(&mut response).await.unwrap();
            assert!(String::from_utf8_lossy(&response).contains("403"));
        }
    }
}
