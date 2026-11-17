import { expect, test, type Page } from "@playwright/test";

async function openPortfolio(page: Page) {
  await page.goto("/");
  await expect(page.locator(".loader")).toBeHidden({ timeout: 20_000 });
}

async function enterWork(page: Page) {
  await page.locator("#work").evaluate(el => el.scrollIntoView({ block: "center" }));
  await expect(page.locator("#work")).toHaveAttribute("data-glass-carousel", "canvas");
  await expect.poll(() => page.locator("#work video").evaluateAll(videos =>
    videos.some(video => !(video as HTMLVideoElement).paused && (video as HTMLVideoElement).currentTime > 0),
  )).toBe(true);
}

test("startup reserves bandwidth and WebGL for the visible content", async ({ page }) => {
  const media: string[] = [];
  page.on("request", request => { if (request.url().endsWith(".mp4")) media.push(request.url()); });
  await openPortfolio(page);
  expect(media).toEqual([]);
  await expect(page.locator("#work")).toHaveAttribute("data-glass-carousel", "");
  expect(await page.locator("[data-sequence-canvas]").evaluate((canvas: HTMLCanvasElement) =>
    canvas.getContext("2d")!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data[3],
  )).toBe(255);
});

test("hero scrubs and reverses without changing its backing resolution", async ({ page }) => {
  await openPortfolio(page);
  const hero = page.locator("[data-sequence-canvas]");
  const initial = await hero.evaluate((canvas: HTMLCanvasElement) => ({
    image: canvas.toDataURL(), width: canvas.width, height: canvas.height,
  }));
  await page.evaluate(() => scrollTo(0, innerHeight * 0.9));
  await expect.poll(() => hero.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(initial.image);
  expect(await hero.evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height])).toEqual([initial.width, initial.height]);
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => hero.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(initial.image);
});

test("the star stops consuming frames offscreen and resumes on return", async ({ page }) => {
  await openPortfolio(page);
  const star = page.locator(".star-icon");
  const initial = await star.evaluate(el => el.style.transform);
  await expect.poll(() => star.evaluate(el => el.style.transform)).not.toBe(initial);
  await page.locator("#contact").evaluate(el => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(250);
  const offscreen = await star.evaluate(el => el.style.transform);
  await page.waitForTimeout(250);
  expect(await star.evaluate(el => el.style.transform)).toBe(offscreen);
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => star.evaluate(el => el.style.transform)).not.toBe(offscreen);
});

test("glass carousel plays, drags, handles horizontal wheel, and pauses offscreen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openPortfolio(page);
  await enterWork(page);
  const canvas = page.locator("[data-glass-carousel-canvas]");
  const counter = page.locator("[data-glass-carousel-counter]");
  await expect(counter).toHaveText("01/03");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 25 });
  await page.mouse.up();
  await expect(counter).not.toHaveText("01/03");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const beforeWheel = await counter.textContent();
  await page.mouse.wheel(650, 0);
  await expect(counter).not.toHaveText(beforeWheel!);
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => page.locator("#work video").evaluateAll(videos =>
    videos.every(video => (video as HTMLVideoElement).paused),
  )).toBe(true);
  await enterWork(page);
  expect(errors).toEqual([]);
});

test("links, text reveals, marquee, and responsive layout remain usable", async ({ page }) => {
  await openPortfolio(page);
  await page.locator("#info").evaluate(el => el.scrollIntoView({ block: "center" }));
  await page.getByRole("link", { name: "Click here" }).click();
  await expect(page.locator("#work")).toHaveAttribute("data-glass-carousel", "canvas");
  await page.locator("#contact").evaluate(el => el.scrollIntoView({ block: "center" }));
  const email = page.getByRole("link", { name: "amalprasad1998@gmail.com" });
  await expect(email).toHaveAttribute("href", "mailto:amalprasad1998@gmail.com");
  await expect(email).toBeVisible();
  await expect(page.getByRole("link", { name: "+91 79997 87808" })).toHaveAttribute("href", "tel:+917999787808");
  const marquee = page.locator("[data-marquee-collection-target]").first();
  const position = await marquee.evaluate(el => getComputedStyle(el).transform);
  await expect.poll(() => marquee.evaluate(el => getComputedStyle(el).transform)).not.toBe(position);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("reduced motion draws a static hero without unused media or 3D", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const frames: string[] = [], media: string[] = [];
  page.on("request", request => {
    if (/sequence\/frame-/.test(request.url())) frames.push(request.url());
    if (request.url().endsWith(".mp4")) media.push(request.url());
  });
  await openPortfolio(page);
  expect(frames).toHaveLength(1);
  expect(media).toEqual([]);
  expect(await page.locator("[data-sequence-canvas]").evaluate((canvas: HTMLCanvasElement) =>
    canvas.getContext("2d")!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data[3],
  )).toBe(255);
  await expect(page.locator("#work")).toHaveAttribute("data-glass-carousel", "");
});

test("video failures keep project artwork visible in the glass carousel", async ({ page }) => {
  await page.route("**/work/*.mp4", route => route.abort());
  await openPortfolio(page);
  await page.locator("#work").evaluate(el => el.scrollIntoView({ block: "center" }));
  await expect(page.locator("#work")).toHaveAttribute("data-glass-carousel", "canvas");
  await expect(page.locator("[data-glass-carousel-caption]")).toContainText("AGP Enterprises");
  await expect(page.locator("[data-glass-carousel-canvas]")).toBeVisible();
});

test("without WebGL the original project list stays visible and scrollable", async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
      apply(target, canvas, args) {
        if (String(args[0]).includes("webgl")) return null;
        return Reflect.apply(target, canvas, args);
      },
    });
  });
  await openPortfolio(page);
  await page.locator("#work").evaluate(el => el.scrollIntoView({ block: "center" }));
  await expect(page.locator("#work video").first()).toBeVisible();
  await expect(page.locator("[data-glass-carousel-canvas]")).toBeHidden();
  await page.locator("[data-glass-carousel-list]").evaluate(el => { el.scrollLeft = 500; });
  expect(await page.locator("[data-glass-carousel-list]").evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
});
