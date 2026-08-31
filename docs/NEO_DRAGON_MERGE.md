# Warn System — Catatan untuk Admin Neo Dragon Sentinel

Bot standalone ini (Who Is The Impostor) sekarang punya sistem warn yang
**di-clone langsung** dari
[NEO-Dragon-Sentinel](https://github.com/Okelahbegitu/NEO-Dragon-Sentinel)
(`commands/warn.js` → `giveWarn()`), supaya perilakunya identik dengan yang
sudah dipakai admin di server utama:

- Warn ke-2 (aktif) → timeout (kalau durasi diberikan)
- Warn ke-3 (aktif) → ban otomatis
- User dapat DM embed pemberitahuan setiap kali kena warn

## Kondisi saat ini (standalone, untuk debugging)

File-file yang di-clone:

| Standalone (bot ini)                    | Asal di Neo Dragon                          |
|------------------------------------------|----------------------------------------------|
| `function/impostor/moderation.js`         | `commands/warn.js` (fungsi `giveWarn`)       |
| `models/imp_crime_note_tb.js`             | `models/crime_note_members_tb.js`             |
| `function/impostor/id_maker.js`           | `function/id_maker.js`                        |

**Skema tabel dibuat identik** (nama tabel `crime_note_members_tb`, kolom
sama persis) — supaya kalau nanti digabung, data lama tidak perlu migrasi
apa pun, tinggal disambungkan ke DB yang sama.

Saat ini tabel `crime_note_members_tb` yang dipakai bot standalone ini ada
di **database bot standalone sendiri** (lihat `DB_NAME` di `.env`), BUKAN
database Neo Dragon. Artinya: warn yang dikasih dari sini (misal karena
`/opengame` dipakai di channel salah) **tidak nyambung** dengan riwayat
warn user yang sama di Neo Dragon — dua riwayat terpisah.

## Cara menggabungkan nanti (kalau bot ini di-merge balik ke Neo Dragon)

Ada dua opsi:

### Opsi A — Copot model standalone, pakai punya Neo Dragon (disarankan)

Kalau bot ini sudah jadi bagian dari codebase Neo Dragon (bukan standalone
lagi):

1. Hapus `models/imp_crime_note_tb.js` dan `function/impostor/id_maker.js`
   dari bot ini.
2. Di `function/impostor/moderation.js`, ganti baris:
   ```js
   const CrimeNote = require("../../models/imp_crime_note_tb");
   ```
   jadi:
   ```js
   const CrimeNote = require("../../models/crime_note_members_tb"); // punya Neo Dragon
   ```
3. Karena nama tabel & kolom sudah identik dari awal, tidak perlu migrasi
   data — riwayat warn dari fitur impostor otomatis nyatu dengan riwayat
   warn Neo Dragon yang sudah ada (asal `username_id` = Discord user ID
   yang sama).

### Opsi B — Tetap dua database terpisah, sambungkan lewat DB config

Kalau bot impostor tetap mau jalan sebagai proses terpisah tapi share data
warn dengan Neo Dragon:

1. Di `.env` bot standalone, arahkan `DB_NAME` (dan `DB_HOST`/`DB_USER`/
   `DB_PASS` kalau beda server) ke **database yang sama** dengan Neo
   Dragon.
2. Tidak perlu ubah kode apa pun — karena nama tabel sudah sama persis
   (`crime_note_members_tb`), begitu `DB_NAME` diarahkan ke DB yang sama,
   `imp_crime_note_tb.js` otomatis baca/tulis ke tabel yang sama dengan
   yang dipakai `warn.js` Neo Dragon.
3. **Perhatian**: pastikan tidak ada dua proses yang melakukan
   `.sync({ alter: true })` bersamaan ke tabel yang sama — di kode ini
   sengaja dipakai `{ alter: false }` supaya aman kalau tabel sudah ada.

## Yang TIDAK ikut ter-clone (sengaja)

- Command `/warn` itu sendiri (slash command manual admin) — belum dibuat
  di bot standalone ini, karena warn di sini cuma dipicu otomatis oleh
  guard `/opengame`. Kalau admin ingin bisa warn manual dari bot ini juga,
  minta untuk ditambahkan terpisah.
- Sistem appeal/banding lewat ticket (disebut di footer DM Neo Dragon) —
  footer DM di bot ini diubah supaya tidak menyesatkan (tidak menjanjikan
  ticket yang belum ada di bot standalone ini).
