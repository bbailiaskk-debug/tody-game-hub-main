export default async function run(page) {
  const btnAt = (i) => page.locator("main .grid.grid-cols-8 button").nth(i);
  await btnAt(52).click();
  await page.waitForTimeout(200);
  const afterSelect = await page.evaluate(() => {
    const sel = [...document.querySelectorAll("main .grid.grid-cols-8 button")].filter((b) =>
      [...b.children].some((c) => c.className.includes("inset-0") && c.className.includes("brand")),
    );
    return sel.map((b) => b.getAttribute("aria-label"));
  });
  await btnAt(44).click();
  await page.waitForTimeout(300);
  const afterMove = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("main .grid.grid-cols-8 button")].map((b) =>
      b.getAttribute("aria-label"),
    );
    return { e3: labels[44], e2: labels[52] };
  });
  return { afterSelect, afterMove };
}
