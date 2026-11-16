import { test, expect } from '@playwright/test';
test('navigation, liens invalides et absence de débordement',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  if(testInfo.project.name==='text-zoom') await page.evaluate(()=>{document.documentElement.style.zoom='1.3';});
  await expect(page.getByRole('heading',{name:'Un lien. Votre prochain fichier.'})).toBeVisible();
  await page.getByLabel('Vos liens audio ou vidéo').fill('file:///C:/secret');
  await page.getByRole('button',{name:'Analyser les liens'}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('navigation')).toBeVisible();
  await page.screenshot({path:`test-results/${testInfo.project.name}-home.png`,fullPage:true});
  for(const label of ['Téléchargements','Historique','Paramètres','À propos']) {
    await page.getByRole('button',{name:label,exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  }
  expect(errors).toEqual([]);
});
test('formulaire utilisable au clavier',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Un lien. Votre prochain fichier.'})).toBeVisible();
  await page.keyboard.press('Tab');await expect(page.getByText('Aller au contenu')).toBeFocused();
  await page.getByLabel('Vos liens audio ou vidéo').focus();
  await page.keyboard.type('https://vimeo.com/123');
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Analyser les liens'})).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.getByRole('alert')).toContainText('application Windows');
});
