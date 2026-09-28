import { chromium, Page } from "playwright";
import dotenv from "dotenv";

// Tentukan path ke file .env2 milik Anda
dotenv.config({ path: ".env2" });

// ============================================================
// CONFIG
// ============================================================

const EVENT_URL =
  "https://bigbanginjakarta.com/#tickets";

// ============================================================
// USER DATA
// ============================================================

const USER = {
  fullName: process.env.FULL_NAME ?? "",
  email: process.env.EMAIL ?? "",
  phone: process.env.PHONE ?? "",
  identityId: process.env.IDENTITY_ID ?? "",

  dobDay: process.env.DOB_DAY ?? "",
  dobMonth: process.env.DOB_MONTH ?? "",
  dobYear: process.env.DOB_YEAR ?? "",

  gender: process.env.GENDER ?? "",
  methodPayment: process.env.METHODPAYMENT ?? "",
  va: process.env.VA ?? "",
};

const TICKET_TARGET = {
  categoryName: process.env.TICKET_CATEGORY ?? "",
  quantity: process.env.TICKET_QUANTITY ?? "1",
};

// ============================================================
// HELPER
// ============================================================

async function screenshot(
  page: Page,
  name: string
) {
  try {
    await page.screenshot({
      path: name,
      fullPage: true,
    });

    console.log(`📸 Screenshot: ${name}`);
  } catch {
    console.log("⚠️ Gagal mengambil screenshot.");
  }
}

async function waitShort(ms = 300) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// VALIDATE ENV
// ============================================================

function validateUser() {
  const required = [
    ["FULL_NAME", USER.fullName],
    ["EMAIL", USER.email],
    ["PHONE", USER.phone],
    ["IDENTITY_ID", USER.identityId],
    ["DOB_DAY", USER.dobDay],
    ["DOB_MONTH", USER.dobMonth],
    ["DOB_YEAR", USER.dobYear],
    ["TICKET_CATEGORY", TICKET_TARGET.categoryName],
    ["TICKET_QUANTITY", TICKET_TARGET.quantity],
    ["METHODPAYMENT", USER.methodPayment],
    ["VA", USER.va],
  ];

  const missing = required
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Data .env belum lengkap: ${missing.join(", ")}`
    );
  }
}

// ============================================================
// HANDLE COOKIE POPUP (SPECIFIC DOM CLASS)
// ============================================================
async function dismissCookieBanner(page: Page) {
  try {
    // Selector spesifik dari CookieYes DOM (.cky-btn-accept & data-cky-tag)
    const acceptBtn = page.locator('.cky-btn-accept, button[data-cky-tag="accept-button"]').first();

    await acceptBtn.waitFor({ state: "visible", timeout: 2_500 });
    await acceptBtn.click({ force: true });
    console.log("🍪 Pop-up Cookie (.cky-btn-accept) berhasil ditutup!");
    await waitShort(300);
  } catch {
    // Abaikan jika pop-up cookie tidak muncul di layar
  }
}

// ============================================================
// 1. OPEN EVENT
// ============================================================

async function openEvent(page: Page) {
  console.log("🌐 Membuka event...");

  await page.goto(EVENT_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  // Bersihkan cookie banner segera setelah halaman terbuka
  await dismissCookieBanner(page);

  console.log("✅ Event terbuka.");
}

// ============================================================
// 2. CLICK BELI TIKET
// ============================================================

async function clickBuyTicket(page: Page) {
  console.log("🎟️ Mencari tombol pembelian...");
  const buyButtons = page.locator('button:has-text("Buy Ticket")');

  await buyButtons.waitFor({
    state: "visible",
    timeout: 5_000,
  });

  await buyButtons.scrollIntoViewIfNeeded();

  console.log("✅ Tombol Beli Tiket ditemukan.");

  await buyButtons.click({ force: true });

  console.log("🖱️ Beli Tiket diklik.");

  await page.waitForTimeout(1_000);
}

// ============================================================
// 3. FIND FIRST AVAILABLE TICKET & PICK QUANTITY (FAST VERSION)
// ============================================================
async function selectFirstAvailableTicket(page: Page) {
  console.log("🔎 Mencari tombol 'Pilih' pada kategori pertama...");

  // Tutup cookie banner SEKALI saja di awal sebelum klik
  await dismissCookieBanner(page);

  // 1. Lokasi tombol 'Pilih'
  const pilihButton = page.locator('button').filter({
    hasText: /pilih/i
  }).first();

  await pilihButton.waitFor({ state: "visible", timeout: 15_000 });
  await pilihButton.scrollIntoViewIfNeeded();

  console.log("🖱️ Membuka dropdown pilihan tiket...");
  await pilihButton.click({ force: true });

  // 2. Langsung pilih jumlah tiket tanpa jeda penantian cookie
  await pickQuantity(page, TICKET_TARGET.quantity || "1");
}

// Helper khusus untuk memilih jumlah tiket dari Popover Radix UI
async function pickQuantity(page: Page, quantity = "1") {
  console.log(`🔢 Memilih jumlah tiket (${quantity})...`);

  // Selector cepat langsung menyasar item angka di portal Radix
  const optionItem = page
    .locator('[role="menuitem"], [role="option"], button, div')
    .filter({
      hasText: new RegExp(`^\\s*${quantity}\\s*$`)
    })
    .first();

  try {
    // Beri timeout singkat (1 detik) agar jika cepat langsung terklik
    await optionItem.waitFor({ state: "visible", timeout: 1_000 });
    await optionItem.click({ force: true });
    console.log(`✅ Berhasil memilih ${quantity} tiket.`);
  } catch (e) {
    // Fallback instan jika selector role tidak langsung merespons
    console.log("⚠️ Fallback klik opsi angka...");
    await page.getByText(quantity, { exact: true }).last().click({ force: true });
  }
}
// ============================================================
// PESAN Tiket
// ============================================================

async function pesanSekarang(page:Page){
  console.log("Siap Order...");
  const btnPesan = page.locator('button').filter({hasText: /Pesan Sekarang/i}).first();

  await btnPesan.waitFor({state: "visible",timeout:2_000});
  await btnPesan.click({force:true});
}

async function syaratKetentuan(page:Page){
  console.log("Scroll syarat ketentuan");
  // Mengambil tombol berdasarkan aria-label
  const scrollBottomBtn = page.getByRole('button', { name: 'Scroll to bottom' });
  // Tunggu dan klik
  await scrollBottomBtn.waitFor({ state: "visible", timeout: 5_000 });
  await scrollBottomBtn.click();
  console.log("⬇️ Tombol auto scroll to bottom diklik.");

  const btnSetuju = page.getByRole('button', { name: 'Ya', exact: true });
  await btnSetuju.waitFor({state: "visible",timeout: 2_000});
  await btnSetuju.click();
}

async function fillPersonalInformation(page:Page){
  console.log(
    "📝 Mengisi Personal Information..."
  );
  // Full Name
  const nameInput = page.locator('input[name="firstname"]').first();
  await nameInput.waitFor({ state: "visible", timeout: 10_000 });
  await nameInput.fill(USER.fullName);

  console.log(`✅ Nama Lengkap terisi: ${USER.fullName}`);

  // Email
  const emailInput = page.locator('input[name="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 10_000 });
  await emailInput.fill(USER.email);

  console.log(`✅ Email terisi: ${USER.email}`);

  //No.HP
  const phoneInput = page.locator('input[inputmode="numeric"]').first();
  await phoneInput.waitFor({ state: "visible", timeout: 10_000 });
  await phoneInput.clear();
  await phoneInput.fill(USER.phone);

  console.log(`✅ No. Handphone terisi: ${USER.phone}`);

  // Identity
  const identityInput = page.locator('input[name="identity_id"]').first();
  await identityInput.waitFor({ state: "visible", timeout: 10_000 });
  await identityInput.fill(USER.identityId);

  console.log(`✅ Identitas terisi: ${USER.identityId}`);

  // DATE OF BIRTH
  // ============================================================
// HELPER: FILL DATE OF BIRTH (DATEPICKER FIX)
// ============================================================

async function fillDateOfBirth(page: Page) {
  console.log("📅 Mengisi Tanggal Lahir...");

  // 1. Klik Tombol "Pilih Tanggal Lahir"
  const dobTrigger = page.locator('button').filter({
    hasText: /Pilih Tanggal Lahir/i
  }).first();

  try {
    await dobTrigger.waitFor({ state: "visible", timeout: 10_000 });
    await dobTrigger.click({ force: true });
    await page.waitForTimeout(300); // Tunggu popover terbuka

    // 2. Pilih Bulan (Berdasarkan format nilai di .env, misal "01" atau "Januari")
    const monthSelect = page.locator('select').first();
    if (await monthSelect.isVisible().catch(() => false)) {
      // Mengubah angka bulan ke nama bulan Indonesia jika .env berisi angka (01 -> Januari)
      const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      const monthValue = !isNaN(Number(USER.dobMonth)) 
        ? months[parseInt(USER.dobMonth, 10) - 1] 
        : USER.dobMonth;

      await monthSelect.selectOption({ label: monthValue }).catch(async () => {
        await monthSelect.selectOption(USER.dobMonth);
      });
    }

    // 3. Pilih Tahun
    const yearSelect = page.locator('select').last();
    if (await yearSelect.isVisible().catch(() => false)) {
      await yearSelect.selectOption(USER.dobYear);
    }

    await page.waitForTimeout(300);

    // 4. Klik Angka Tanggal yang Aktif (Menghindari tanggal dari bulan tetangga)
    // Format hari: hilangkan angka 0 di depan jika ada (misal "05" menjadi "5")
    const dayNumber = parseInt(USER.dobDay, 10).toString();

    // Selector menargetkan button tanggal dalam popover yang TIDAK tersembunyi/disabled
    const dayBtn = page
      .locator('button[name="day"]:not([aria-disabled="true"]), table button:not([disabled])')
      .filter({
        hasText: new RegExp(`^${dayNumber}$`)
      })
      .first();

    await dayBtn.waitFor({ state: "visible", timeout: 5_000 });
    await dayBtn.click({ force: true });

    console.log(`✅ Tanggal Lahir berhasil dipilih: ${dayNumber} ${USER.dobMonth} ${USER.dobYear}`);

  } catch (error) {
    console.log("⚠️ Gagal memilih tanggal lahir. Mencoba klik alternatif...");
    
    // Fallback: Klik langsung berdasarkan teks persis angka tanggal
    const dayNumber = parseInt(USER.dobDay, 10).toString();
    await page.getByRole('button', { name: dayNumber, exact: true }).first().click({ force: true });
  }
}
  await fillDateOfBirth(page);

  // Ambil gender (1 atau 2), lalu klik tombolnya
  // const value = "1"; // atau "2"
  await page.locator(`button[value="${USER.gender}"]`).click({ force: true });
  
  console.log(
    "✅ Data personal terisi."
  );
}
// ============================================================
// SELECT VIRTUAL ACCOUNT
// ============================================================

async function selectMethodPayment(
  page: Page
) {
  console.log(
    `🏦 Mencari ${USER.methodPayment}...`
  );

  // Menargetkan tombol accordion Virtual Account yang posisinya tertutup (closed)
  const methodPayment = page.locator('button[data-state="closed"]').filter({
  hasText: new RegExp(USER.methodPayment, 'i')
  }).first();
  try {
    // Tunggu sebentar untuk memastikan accordion tertutup terdeteksi
    await methodPayment.waitFor({ state: "visible", timeout: 3_000 });
    await methodPayment.click({ force: true });
    console.log(`✅ Pilihan ${USER.methodPayment} berhasil dibuka!`);
  } catch (error) {
    console.log(`ℹ️ Accordion ${USER.methodPayment} sudah dalam kondisi terbuka atau tidak ditemukan.`);
  }

  console.log(
    `✅ ${USER.methodPayment} dibuka.`
  );
}

// ============================================================
// SELECT BCA
// ============================================================

async function selectVirtualAccount(
  page: Page
) {
  console.log(
    `🔘 Memilih ${USER.va}...`
  );

  const optionVirtualAccount = page.getByLabel(`${USER.va}`, { exact: true }).first();

  await optionVirtualAccount.waitFor({
    state: 'visible',
    timeout: 10_000
  });

  await optionVirtualAccount.click();

  console.log("✅ ${USER.va} berhasil diklik");
}

  // ==========================================================
  // TERMS & CONDITIONS
  // ==========================================================

  async function syaratKetentuanPrivacy(page:Page){
  console.log("☑️ Mencari checkbox Terms & Conditions...");

  const termsCheckbox = page.locator('#terms');

  await termsCheckbox.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  await termsCheckbox.check();

  console.log("✅ Terms & Conditions dicentang.");

  // ==========================================================
  // PERSONAL DATA PROCESSING POLICY
  // ==========================================================

  console.log(
    "☑️ Mencari Personal Data Processing Policy..."
  );

  const privacyCheckbox = page.locator('#consent');

  await privacyCheckbox.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  await privacyCheckbox.check();

  console.log(
    "✅ Personal Data Processing Policy dicentang."
  );

  await waitShort(500);
}

async function bayarSekarang (page:Page){
  const btnBayar = page.locator('button').filter({hasText: /Bayar Sekarang/i}).first();
  await btnBayar.click();
}

  // ==========================================================
  // KLIK BAYAR SEKARANG
  // ==========================================================
  

// ============================================================
// MAIN (INCOGNITO MODE)
// ============================================================

async function main() {
  console.log("");
  console.log("==========================================");
  console.log("    LOKET DWP 2026 BOT (INCOGNITO MODE)");
  console.log("==========================================");
  console.log("");

  validateUser();

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--incognito"
    ],
  });

  const context = await browser.newContext({
    viewport: {
      width: 1366,
      height: 768,
    },
  });

  const page = await context.newPage();

  try {
    // 1. Open Event
    await openEvent(page);

    // 2. Click Buy Ticket
    await clickBuyTicket(page);

    // 3. Select Ticket & Quantity
    await selectFirstAvailableTicket(page);
    // 4. Pesan tiket
    await pesanSekarang(page);
    await syaratKetentuan(page);
    // 5. Isi Data Diri
    await fillPersonalInformation(page);
    // 6. Pilih Methode Pembayaran
    await selectMethodPayment(page);
    await selectVirtualAccount(page);
    // 7. Ceklis Syarat Ketentuan & Privacy
    await syaratKetentuanPrivacy(page);
    // 8. Bayar
    await bayarSekarang(page);

    console.log("");
    console.log("==========================================");
    console.log("✅ PROSES OTOMATIS TIKET SELESAI");
    console.log("==========================================");
    console.log(`📍 URL: ${page.url()}`);
    console.log("");

    // Tahan browser agar tidak langsung tertutup
    await new Promise(() => {});
  } catch (error) {
    console.log("");
    console.log("❌ TERJADI ERROR");
    console.error(error);

    await screenshot(page, `error-${Date.now()}.png`);

    console.log("");
    console.log(`📍 URL terakhir: ${page.url()}`);

    await context.close();
    await browser.close();
  }
}

main();
