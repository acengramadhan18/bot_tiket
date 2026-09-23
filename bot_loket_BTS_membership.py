import asyncio
from playwright.async_api import async_playwright
import sys
import os

# ========================================================
# [CONFIG] DATA WAR TIKET (SESUAIKAN DATA ANDA DI SINI)
# ========================================================
TARGET_URL = "https://bigbanginjakarta.com/#tickets" 
VIP_CODE   = "825CKV" # Masukkan kode VIP/Membership Anda

# Data diri asli Anda untuk pengisian formulir Loket secara kilat
NAMA_ANDA  = "Fikri Ramadhan"
EMAIL_ANDA = "fikriramadhan180199@gmail.com"
TELP_ANDA  = "81213428586"        # Tanpa angka 0 di depan karena format +62
NIK_ANDA   = "3603121801990004"   # 16 Digit NIK KTP Kategori Valid
GENDER     = "Laki-laki"          # Pilihan wajib: "Laki-laki" atau "Perempuan"

# ========================================================
# SELEKTOR UTAMA SISTEM LOKET (TIDAK PERLU DIUBAH)
# ========================================================
TICKET_BUTTON_SELECTOR = "button.lp-button.full:has-text('Buy Ticket')"
ACCESS_INPUT_SELECTOR  = "input[placeholder*='code']"
QUEUE_BUTTON_SELECTOR  = "button:has-text('Join Queue')"
DROPDOWN_SELECTOR      = "button[aria-haspopup='menu']"

async def run_war_bot():
    async with async_playwright() as p:
        print("[⚡] Memulai Bot War Tiket Resmi Loket...")
        
        # Membuka profil persisten Microsoft Edge asli laptop Anda untuk bypass Cloudflare
        user_data_dir = os.path.join(os.getcwd(), "EdgeBotProfile")
        context = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,
            channel="msedge",
            args=["--disable-blink-features=AutomationControlled", "--start-maximized"],
            ignore_https_errors=True
        )
        
        # Mengunci objek halaman utama peramban tunggal
        page = context.pages[0] if context.pages else await context.new_page()
        
        print(f"[🌐] Menuju URL Target Penjualan: {TARGET_URL}")
        await page.goto(TARGET_URL)
        
        # ========================================================
        # [TAHAP 1] MONITORING & KLIK TOMBOL "BUY TICKET"
        # ========================================================
        attempts = 0
        while True:
            attempts += 1
            try:
                button = page.locator(TICKET_BUTTON_SELECTOR)
                if (await button.count()) > 0 and not (await button.nth(0).is_disabled()):
                    print(f"\n[💥] TOMBOL WAR AKTIF! Mengeklik tombol utama...")
                    await button.nth(0).click()
                    break
            except Exception:
                sys.stdout.write(f"\r[Monitoring] Mencari tombol aktif... Percobaan ke-{attempts}")
                sys.stdout.flush()
                await page.reload()
                await asyncio.sleep(0.1)

        # ========================================================
        # [TAHAP 2] INPUT KODE AKSES & ANTREAN CLOUDFLARE TURNSTILE
        # ========================================================
        print("\n[🔑] Dialihkan! Memasuki halaman validasi akses...")
        await page.wait_for_selector(ACCESS_INPUT_SELECTOR, state="visible", timeout=15000)
        await page.locator(ACCESS_INPUT_SELECTOR).fill(VIP_CODE)
        
        print("[⏳] Silahkan bantu centang kotak CAPTCHA secara manual jika muncul tantangan di layar...")
        while True:
            queue_button = page.locator(QUEUE_BUTTON_SELECTOR)
            if (await queue_button.count()) > 0 and not (await queue_button.is_disabled()):
                print("[💥] Verifikasi Lolos! Menekan tombol 'Join Queue' untuk masuk antrean...")
                await queue_button.click()
                break
            await asyncio.sleep(0.1)
            
        # ========================================================
        # [TAHAP 3] JET BYPASS: PILIH KATEGORI TERATAS & JUMLAH 2 TIKET
        # ========================================================
        print("[🎯] Anda resmi masuk antrean. Menunggu halaman tiket terbuka otomatis...")
        
        # Menunggu sistem antrean selesai dan halaman denah kategori muncul di peramban
        await page.wait_for_selector(DROPDOWN_SELECTOR, state="visible", timeout=600000) 
        print("\n[💎] Antrean tembus! Mengeksekusi Injeksi JS Satu Atap pada kategori teratas...")
        
        # Injeksi Javascript murni tanpa menggunakan tanda komentar pagar (#) agar terhindar dari SyntaxError
        await page.evaluate('''
            const allButtons = Array.from(document.querySelectorAll("button[aria-haspopup='menu']"));
            if (allButtons.length > 0) {
                // Mengambil tombol pilihan aktif pertama yang berada di posisi paling atas (misal CAT 2)
                const targetCategoryButton = allButtons[0];
                targetCategoryButton.click();
                
                // Beri jeda mikro 150ms agar pop-up opsi angka memantul keluar, lalu eksekusi kuantitas maksimal (2)
                setTimeout(() => {
                    const menuItems = Array.from(document.querySelectorAll("button[role='menuitem'], [role='menuitem'], .dropdown-item"));
                    const optionTwo = menuItems.find(el => el.textContent.trim() === '2');
                    
                    if (optionTwo) {
                        optionTwo.click();
                    } else {
                        const numInput = document.querySelector("input[type='number']");
                        if (numInput) { numInput.value = "2"; }
                    }
                    
                    // Langsung paksa bypass status kunci tombol "Pesan Sekarang" dan lakukan klik internal
                    const btnPesan = Array.from(document.querySelectorAll("button")).find(el => el.textContent.includes("Pesan Sekarang"));
                    if (btnPesan) {
                        btnPesan.removeAttribute("disabled");
                        btnPesan.disabled = false;
                        btnPesan.click();
                    }
                }, 150);
            }
        ''')
        print("[🎉] Kategori aktif teratas dan kuota 2 tiket sukses diamankan ke sistem!")

        # ========================================================
        # [TAHAP 3.5] BYPASS INSTAN POP-UP SYARAT & KETENTUAN (AUTO-SCROLL)
        # ========================================================
        print("[📜] Menunggu pop-up Syarat & Ketentuan muncul...")
        await page.wait_for_selector("div.modal-body, .modal-content, [class*='modal']", state="visible", timeout=10000)
        
        print("[⚡] Memaksa auto-scroll ke bagian teks terbawah dalam 1 milidetik...")
        await page.evaluate('''
            const box = document.querySelector("div.modal-body") || document.querySelector(".modal-content") || document.querySelector("[class*='modal']");
            if (box) { box.scrollTop = box.scrollHeight; }
        ''')
        
        print("[💥] Menyetujui syarat ketentuan. Meluncur ke halaman formulir...")
        await page.locator("button:has-text('Ya'), button.btn-primary").click()

        # ========================================================
        # [TAHAP 4] PENGISIAN FORMULIR DATA DIRI KILAT (ANTI-SCRAMBLING)
        # ========================================================
        print("\n[⌨️] Memasuki halaman formulir. Mengisi data diri secara simultan...")
        await page.wait_for_selector("input[placeholder*='firstname']", state="visible", timeout=15000)

        # Mengisi kolom input teks menggunakan kombinasi selector akurat Loket
        await page.locator("input[placeholder*='firstname']").fill(NAMA_ANDA)
        await page.locator("input[name='email']").fill(EMAIL_ANDA)
        await page.locator("input[inputmode='numeric']").fill(TELP_ANDA)
        await page.locator("input[placeholder*='Identity_id']").fill(NIK_ANDA)
        
        # Memilih opsi gender
        await page.locator(f"label:has-text('{GENDER}')").first.click()

        # Membukakan panel pop-up kalender Tanggal Lahir (Silahkan klik angka tanggal lahir Anda secara cepat)
        print("[📅] Membuka panel kalender Tanggal Lahir...")
        await page.locator("button:has-text('Pilih Tanggal Lahir')").click()

        # ========================================================
        # [TAHAP 5] OTOMATISASI METODE VIRTUAL ACCOUNT & CHECKBOX PERSYARATAN
        # ========================================================
        print("[💳] Memilih opsi metode Virtual Account Mandiri...")
        await page.locator("button:has-text('Virtual Account')").first.click()
        await asyncio.sleep(0.3) # Jeda animasi accordion drop bank
        await page.locator("button:has-text('Virtual Account Mandiri')").click()

        print("[☑️] Mencentang persetujuan Syarat Ketentuan & Kebijakan Privasi...")
        await page.locator("button#terms").click()
        await page.locator("button#consent").click()

        # ========================================================
        # [TAHAP 6] KUNCI TAGIHAN (HANDOVER MANUSIA)
        # ========================================================
        print("\n========================================================")
        print("[🎉] SUKSES: BOT SELESAI MENYELESAIKAN SELURUH PROSES FORM WAR!")
        print("[💰] SILAHKAN TEKAN TOMBOL 'BAYAR SEKARANG' MANUAL PADA LAYAR EMAS ANDA!")
        print("========================================================")
        
        # Browser ditahan agar tidak tertutup otomatis selama 20 menit ke depan
        # await asyncio.sleep(1200)

if __name__ == "__main__":
    asyncio.run(run_war_bot())
