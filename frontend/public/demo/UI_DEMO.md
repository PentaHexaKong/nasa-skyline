# LUNA: demo frontend lokal

## Buka halaman

Buka index.html di browser dengan klik dua kali; file styles.css dan app.js harus berada di folder yang sama. Tidak ada instalasi dependency, build, API key, internet, atau backend yang diperlukan untuk demo ini.

Atau dari PowerShell:

```powershell
Start-Process '.\frontend\public\demo\index.html'
```

Melalui Compose: jalankan docker compose up --build dari root, kemudian buka http://localhost:8080. Dockerfile frontend sudah menyalin semua aset. Mode Compose masih menunggu kesiapan DS/ML/Go sesuai konfigurasi yang ada.

## Coba alurnya

1. Pilih Punggung A dan periode 14 hari. Ketiganya adalah lokasi rekaan, bukan kandidat lokasi pendaratan yang sudah dipilih.
2. Geser waktu atau klik play. Amati Matahari/Bumi terhadap garis medan; status diperbarui sesuai cursor. Lintasan dan ukuran objek adalah ilustrasi.
3. Baca persentase waktu bercahaya, Bumi terlihat langsung, gelap terpanjang, dan gap kontak. Lihat garis waktu untuk menemukan periodenya.
4. Pilih 1 atau 2 relay. Lihat gap dan timeline kontak gabungan berubah. Metrik cahaya tidak berubah hanya karena relay ditambah.
5. Klik Tambah ke perbandingan. Ganti lokasi/tanggal/relay lalu tambahkan lagi.
6. Buka Bandingkan untuk melihat hingga tiga skenario. Buka lagi atau hapus skenario dari kartunya. Skenario duplikat ditolak dan penyimpanan hilang saat halaman dimuat ulang.
7. Buka Cara membaca untuk ringkasan istilah/alur. Tombol pengujian API di footer menuju integration.html.

## Makna data dan batasnya

- app.js menghasilkan sinyal contoh deterministik untuk menggambarkan perubahan UI; ini bukan ephemeris, propagasi orbit, perhitungan pencahayaan, atau keluaran DS/ML. Tanggal hanya memvariasikan pola contoh.
- Tidak ada fetch, dataset NASA, library jarak jauh, atau perhitungan ilmiah yang dimuat oleh halaman utama.
- Satu sampel contoh mewakili dua jam; ringkasan berbobot durasi seragam. Gap/gelap dihitung hanya dalam interval yang ditampilkan. Event terbenam memakai transisi sampel, bukan pencarian event sains.
- Kontak gabungan berarti direct ATAU relay ilustratif tersedia. Sinyal relay dibuat langsung untuk ilustrasi, bukan hasil validasi semua hop atau link budget.
- Tiga lokasi, medan, orbit, garis pandang, waktu kejadian, dan semua angka adalah ilustrasi. Hasil tidak boleh diklaim sebagai kondisi Bulan yang diprediksi.
- Tidak ada peringkat lokasi terbaik atau klaim keselamatan/kelayakan misi. Periode/asumsi harus disamakan untuk perbandingan ilmiah nanti.
- Penghubungan UI ke kontrak DS yang disepakati masih menjadi pekerjaan berikutnya. integration.html tetap halaman pengujian request/response backend.

## Pemeriksaan

JavaScript diperiksa dengan node --check. Interaksi diperiksa di Chrome headless yang terpasang: desktop 1440px, mobile 390px, pergantian lokasi, tanggal/durasi, play, scrub, relay, simpan/duplikat/perbandingan, buka ulang, hapus, dan dialog panduan. Tidak ditemukan runtime exception selama pemeriksaan tersebut. Docker Engine tidak dijalankan sebagai bagian verifikasi UI ini.
