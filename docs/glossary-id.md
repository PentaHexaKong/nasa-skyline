# Glosarium NASA + backend: arti sederhana dan contoh

Penjelasan dalam bahasa Indonesia; nama field tetap sesuai file agar bisa dicari dengan Ctrl+F. Semua angka contoh di sini adalah ilustrasi belajar, bukan hasil analisis lunar.

Sumber: [persyaratan produk](product/requirements.md); [kode backend](../backend/main.go); [Compose](../compose.yaml); Dockerfile dan server masing-masing service; [Nginx](../frontend/nginx.conf); serta contracts/ dan examples/. Kontrak domain masih usulan: backend belum menjalankan validator JSON Schema.

Baca tabel peran dan istilah dasar dahulu, lalu tabel field ketika membuka JSON. Istilah tambahan seperti SPICE dan relay berasal dari konsep proyek; tidak semuanya merupakan persyaratan produk.

## Peran dan dasar proyek

| Istilah | Arti sederhana | Contoh/konteks proyek |
| --- | --- | --- |
| Backend / BE | Program server yang m enerima permintaan, mengatur proses, dan mengirim hasil. | Go menjadi penghubung FE dengan DS/ML. |
| Frontend / FE | Tampilan dan interaksi yang dipakai pengguna. | Halaman utama sekarang menampilkan grafik ilustrasi; pengikatan ke hasil DS belum dibuat. |
| Data Science / DS | Pekerjaan mengolah data dan menentukan metode analisis. | Rencana mengolah terrain dan posisi benda langit. Tidak selalu memakai ML. |
| Machine Learning / ML | Metode dengan model yang belajar pola dari data. | Layanan opsional; model/target prediksi belum dibuat. |
| Model | Representasi sistem; bisa rumus fisika, bentuk medan, atau model ML. | Model orbit tidak otomatis model ML. |
| Algoritma | Langkah terdefinisi untuk menghasilkan keluaran dari masukan. | Cara menghitung horizon. |
| Service | Komponen program yang menyediakan layanan. | backend, ds, ml, frontend. |
| Server | Program penerima permintaan; kadang juga komputer tempat program berjalan. | server.py menjalankan HTTP server. |
| Client | Program pengirim permintaan. | Go menjadi client DS/ML; browser menjadi client melalui Nginx. |
| Integrasi | Membuat beberapa komponen bertukar data dengan benar. | Input FE sampai ke DS. |
| Orchestration | Mengatur urutan pemanggilan komponen. | Go menunggu DS sebelum memanggil ML. |
| Pipeline | Rangkaian tahapan pemrosesan. | Input → DS → ML opsional → respons. |
| Baseline | Acuan awal untuk membandingkan tambahan berikutnya. | Sunlight/direct Earth sebelum relay. |
| MVP | Versi kecil yang sudah menyelesaikan kebutuhan utama. | Perbandingan lokasi/tanggal dengan informasi yang benar. |
| Scope | Batas pekerjaan yang disepakati. | Algoritma sains milik DS; jembatan layanan milik backend. |
| Stretch feature | Fitur tambahan setelah kebutuhan utama selesai. | 3D atau relay kompleks. |
| Blueprint / handoff | Rancangan/pembagian kerja dan informasi untuk melanjutkan pekerjaan. | docs/architecture/backend-handoff.md. |
| Sandbox | Lingkungan latihan/eksperimen yang dipisahkan. | Folder proyek ini terpisah dari Matani. |
| Prototype | Versi awal untuk mencoba pendekatan. | Belum membuktikan kesiapan keputusan misi. |
| Stub | Program pengganti sementara yang memberi respons sederhana agar koneksi dapat dikembangkan. | DS/ML sekarang mengembalikan stub_only dan salinan request. |
| Fixture | Data contoh yang disiapkan untuk pengembangan/pengujian. | File clps-ds-result.fixture.json; bukan layanan. |
| Mock | Pengganti komponen dengan perilaku yang dikendalikan dalam tes. | Server lokal yang meniru DS gagal atau berhasil. |
| Synthetic | Dibuat untuk contoh/simulasi. | synthetic-demo-site bukan lokasi pendaratan tervalidasi. |
| Production | Lingkungan aplikasi yang dipakai pengguna sungguhan. | Docker/logging belum membuktikan siap production. |

## Istilah misi, permukaan, dan astronomi

Rujukan persyaratan: [product/requirements.md](product/requirements.md). Dasar ephemeris/koordinat: [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html). Libration: [NASA SVS](https://svs.gsfc.nasa.gov/5195/).

| Istilah | Arti sederhana | Kaitannya dengan proyek |
| --- | --- | --- |
| Lunar | Berkaitan dengan Bulan. | Lunar landing = pendaratan di Bulan. |
| Landing site | Lokasi pendaratan. | Nama kawasan belum menentukan satu titik pengamat. |
| Candidate landing site | Calon lokasi yang masih dievaluasi. | Lokasi A dibandingkan dengan B. |
| Mission planner | Orang yang merencanakan pelaksanaan misi. | Ingin cepat melihat dampak perubahan lokasi/tanggal. |
| CLPS | Commercial Lunar Payload Services, program NASA untuk pengiriman payload ke Bulan melalui penyedia komersial. | Konteks misi, bukan algoritma. |
| Payload misi | Muatan yang dibawa misi, misalnya instrumen sains. | Berbeda dari payload request HTTP. |
| Lander | Wahana yang mendarat di permukaan. | Lokasi antena/panelnya menjadi titik pengamat. |
| Rover | Kendaraan bergerak di permukaan. | Berbeda dari satelit yang mengorbit. |
| Apollo missions | Rangkaian misi Apollo; lokasi pendaratannya disebut sebagai contoh opsi daftar. | Tidak wajib memasukkan semuanya. |
| South pole | Kutub selatan; di sini kutub selatan Bulan. | Kawasan konteks utama proyek. |
| Curated list | Daftar yang dipilih dan diperiksa proyek. | Lokasi beserta koordinat dan sumber. |
| Custom coordinates | Koordinat yang dimasukkan pengguna sendiri. | Opsi dalam persyaratan produk; belum ada kontrol FE produk. |
| Scenario | Set pilihan/asumsi yang dievaluasi. | Lokasi A pada periode X. |
| Trade-off | Pertukaran keuntungan dan kekurangan. | Cahaya lebih banyak belum tentu Earth visibility lebih baik. |
| Feasibility | Kelayakan menurut kebutuhan dan asumsi. | Visibilitas saja belum membuktikan seluruh misi layak. |
| Mission window | Rentang waktu yang memungkinkan kegiatan menurut syaratnya. | Perlu jelas: cahaya, komunikasi, atau peluncuran? |
| Solar array | Susunan panel surya. | Sudut/cahaya membantu menilai potensi daya. |
| Power generation potential | Peluang menghasilkan daya. | Tidak langsung sama dengan watt listrik. |
| Thermal conditions | Kondisi panas/dingin peralatan. | Belum dimodelkan backend. |
| Illumination / sunlight | Pencahayaan Matahari. | Definisi sebagian/seluruh disk harus ditentukan. |
| Celestial body | Benda langit. | Matahari, Bumi, Bulan. |
| Ephemeris / ephemerides | Data/perhitungan posisi dan gerak benda langit sebagai fungsi waktu. | Memberi posisi pada waktu tertentu; bukan peta bukit. |
| Topography | Bentuk dan ketinggian permukaan. | Bukit, lereng, kawah. |
| Terrain | Medan permukaan di suatu kawasan. | Digunakan DS untuk membangun profil penghalang. |
| Horizon | Batas pandangan ke langit dari lokasi pengamat, dipengaruhi penghalang dan kelengkungan permukaan. | Horizon lokal tidak harus pada sudut 0°. |
| Local horizon | Horizon dari suatu titik tertentu. | Menggeser titik dapat mengubah penghalang. |
| Skyline | Profil batas medan di sekeliling pengamat menurut arah. | Grafik arah vs sudut penghalang. |
| Azimuth | Sudut arah mengelilingi pengamat. | Usulan: dari utara lokal searah jarum jam; 90° timur. Tepat di kutub, arah lokal perlu definisi khusus. |
| Elevation angle | Sudut ke atas/bawah terhadap bidang horizontal lokal. | +5° masih tertutup bukit dengan skyline +7°. Bukan tinggi dalam meter. |
| Solar elevation | Sudut elevasi Matahari. | Bukan daya panel. |
| Earth elevation | Sudut elevasi Bumi dari pengamat di Bulan. | Dibandingkan dengan skyline pada arah Bumi. |
| Visibility | Target terlihat menurut definisi/model yang digunakan. | Pusat disk atau bagian disk perlu dipilih. |
| Sunset | Transisi Matahari terlihat → tidak terlihat menurut aturan yang dipakai. | Medan, sampling, dan aturan disk memengaruhi waktu hasil. |
| Earthset | Transisi Bumi terlihat → tidak terlihat dari pengamat di Bulan. | Sejenis sunset dengan Bumi sebagai target. |
| Lunar day | Istilah yang perlu konteks: bisa siklus Matahari di lokasi Bulan; dalam penggunaan umum juga bagian terangnya. | Jangan otomatis diartikan 24 jam atau lama sampling. |
| Season | Perubahan kondisi terkait geometri musiman. | Persyaratan meminta eksplorasi beberapa periode. |
| Libration | Perubahan sudut pandang relatif yang tampak sebagai gerak oleng Bulan dilihat dari Bumi. | Arah Bumi dari permukaan Bulan juga berubah. |
| Orbital variation | Perubahan geometri sepanjang orbit dan dari waktu ke waktu. | Target tidak diasumsikan tetap. |
| Atmospheric refraction | Pembelokan cahaya oleh atmosfer. | Horizon Bulan tidak memakai pembiasan atmosfer seperti Bumi. |
| Slope | Kemiringan permukaan. | Berbeda dari elevasi benda langit. |
| Crater / shadow | Kawah / bayangan karena cahaya terhalang. | Bayangan Matahari tidak otomatis berarti tidak ada kontak Bumi. |
| Temporal dynamics | Perubahan sepanjang waktu. | Bisa divisualkan sebagai timeline/animasi. |
| Timeline | Tampilan kondisi menurut urutan waktu. | Jalur sunlight dan Earth visibility. |
| Spatial relationship | Hubungan posisi/arah antarobjek. | Lander, medan, Matahari, Bumi. |
| 2D / 3D visualization | Tampilan dua/tiga dimensi. | Berbagai bentuk tampilan dibolehkan; 3D tidak wajib. |
| Accessibility across skill levels | Informasi dapat dipahami orang dengan tingkat keahlian berbeda. | Unit/legenda jelas bagi planner maupun publik. |

## Sumber data dan perhitungan pada rencana proyek

Rujukan: [NASA LOLA](https://science.nasa.gov/mission/lro/lola/), [NAIF SPICE](https://naif.jpl.nasa.gov/naif/spiceconcept.html). Ini definisi istilah, bukan klaim dataset sudah dipakai program.

| Istilah | Arti sederhana | Contoh/konteks |
| --- | --- | --- |
| JPL | Jet Propulsion Laboratory. | Nama lembaga pada JPL Horizons. |
| JPL Horizons | Sistem penghasil ephemeris dan geometri pengamatan benda langit. | Disebut dalam persyaratan produk; belum dihubungkan backend. |
| Moon Trek / QuickMap | Alat penjelajahan/peta yang disebut dalam persyaratan produk. | Referensi; bukan service Docker proyek. Nama institusi tidak diverifikasi ulang di sini. |
| LRO | Lunar Reconnaissance Orbiter, pengorbit Bulan NASA. | Wahana pembawa LOLA. |
| LOLA | Lunar Orbiter Laser Altimeter, instrumen laser untuk topografi Bulan. | Sumber data yang disebut dalam persyaratan produk. |
| Altimeter | Alat pengukur ketinggian/jarak untuk antara lain menyusun data permukaan. | LOLA memakai laser. |
| DEM | Digital Elevation Model: representasi digital ketinggian permukaan. | Umumnya grid, bukan foto. |
| Raster / grid | Data berbentuk sel, baris, dan kolom. | Satu sel menyimpan nilai menurut definisi dataset. |
| Resolution | Detail spasial data; pada raster sering ukuran sel. | Ukuran sel kecil belum otomatis berarti error kecil. |
| GeoTIFF / .tif | Format raster TIFF dengan informasi geografis. | Berkas terrain besar tidak dikirim lewat /api/run. |
| Hillshade | Gambaran relief dari model permukaan dan arah cahaya pilihan. | Bukan otomatis bayangan aktual tanggal misi. |
| SPICE | Sistem data/perangkat lunak NAIF untuk geometri pengamatan dan misi. | Pendekatan dalam rencana temanmu. |
| NAIF | Navigation and Ancillary Information Facility. | Kelompok pembangun/pemelihara SPICE. |
| SPICE kernel | Berkas data masukan SPICE: posisi, orientasi, frame, konstanta, atau informasi waktu. | Berbeda dari kernel sistem operasi. |
| Leap second | Penyesuaian detik UTC untuk menjaga hubungannya dengan rotasi Bumi. | Relevan pada konversi waktu astronomi. |
| Epoch | Waktu acuan parameter/posisi tertentu. | Elemen orbit perlu epoch. |
| Coordinate / reference frame | Definisi sumbu dan orientasi koordinat. | Frame berbeda memerlukan transformasi yang benar. |
| Body-fixed frame | Frame yang mengikuti rotasi benda langit. | Harus jelas frame Bulan yang dimaksud. |
| Datum / height reference | Acuan untuk menyatakan ketinggian. | 2 m di atas terrain berbeda dari 2 m di atas acuan lain. |
| Precomputed | Sudah dihitung sebelum pengguna meminta hasil. | API katalog/berkas hasil belum dibuat. |
| Sampling | Menghitung/mengambil nilai pada waktu/arah tertentu. | Contoh langkah 600 detik. |
| Interpolation | Memperkirakan nilai di antara titik data dengan metode tertentu. | Perkiraan sunset di antara dua sampel. |
| Validasi ilmiah | Menguji ketepatan hasil/metode terhadap acuan yang sesuai. | Berbeda dari mengecek JSON valid. |
| Convergence check | Memeriksa hasil saat langkah hitung diperhalus. | Stabil belum sendirian membuktikan model benar. |
| Coverage | Cakupan wilayah, waktu, atau kasus data/model. | Periode di luar cakupan perlu respons unavailable. |
| Provenance | Jejak asal dan proses penghasil data. | Dataset, versi/hash, metode, parameter. |
| Metadata | Informasi yang menjelaskan data. | Satuan, frame, waktu, sumber. |
| Accuracy / uncertainty | Kedekatan dengan acuan benar / ketidakpastian hasil. | Banyak digit belum berarti akurat. |

## Relay: tambahan konsep proyek

Rujukan konsep proyek dan docs/architecture/backend-handoff.md. Rincian orbit/jaringan belum diimplementasikan.

| Istilah | Arti sederhana | Hal yang perlu dipahami |
| --- | --- | --- |
| Direct-to-Earth / DTE | Komunikasi langsung ke arah Bumi tanpa relay antariksa di antaranya. | Masih memerlukan stasiun, antena, daya, dan syarat radio. |
| Communication window | Rentang waktu ketika syarat kontak yang dimodelkan terpenuhi. | Jika hanya geometri, sebut kesempatan kontak geometris. |
| Relay satellite | Satelit perantara yang meneruskan komunikasi. | Lander → relay → Bumi. |
| Ground station | Fasilitas komunikasi di permukaan Bumi. | Bumi terlihat tidak menjamin stasiun tertentu tersedia. |
| Line of sight / LOS | Jalur pandang tanpa penghalang menurut model. | Belum menjamin radio dapat dipakai. |
| Occultation / blocked | Target/jalur tertutup benda atau medan. | Bukit/Bulan memutus pandangan. |
| Hop / path / node | Satu sambungan / rangkaian sambungan / titik perangkat jaringan. | Lander dan relay adalah node; lander→relay satu hop. |
| Mother relay / children | Sebutan untuk relay utama / node kecil. | Nama tersebut belum menentukan orbit. |
| Rim node / rim mast | Node/menara di tepi kawah atau punggung. | Tetap perlu posisi, jalur, dan daya yang jelas. |
| Highly elliptical orbit | Orbit sangat lonjong. | Perlu parameter, epoch, frame, dan model; nama saja belum lengkap. |
| Orbit phasing | Pengaturan posisi/waktu relatif antarwahana pada orbit. | Agar cakupan dua relay bisa berguna. |
| Blackout / contact gap | Periode tanpa kontak menurut aturan. | Berbeda dari dark interval tanpa cahaya. |
| Simultaneous contact | Seluruh sambungan jalur lolos syarat pada waktu yang sama. | Satu hop pagi dan hop lain malam belum berarti kontak serentak. |
| Store-and-forward | Simpan pesan lalu teruskan saat jalur tersedia. | Berbeda dari kontak langsung serentak; belum dimodelkan. |
| Link budget | Perhitungan daya sinyal, rugi-rugi, dan kebutuhan penerimaan radio. | Bukan jumlah satelit; belum dihitung. |
| Capacity / bandwidth | Kemampuan membawa data; bandwidth juga bisa berarti rentang frekuensi. | Visibilitas tidak langsung memberi kecepatan data. |
| Antenna pointing | Pengarahan antena ke target. | Terlihat belum tentu antena dapat diarahkan sesuai kebutuhan. |
| Illustrative orbit | Orbit contoh untuk penjelasan/eksperimen. | Jangan disebut orbit operasional yang terbukti. |


## JSON, API, dan schema

Sumber perilaku: backend/main.go dan contracts/. [JSON Schema annotations](https://json-schema.org/understanding-json-schema/reference/annotations) menjelaskan bahwa default tidak otomatis mengisi data.

| Istilah | Arti sederhana | Contoh/perilaku |
| --- | --- | --- |
| API | Antarmuka yang disepakati untuk komunikasi program. | FE dan Go memakai /api/run. |
| HTTP | Protokol pertukaran request/response web. | Browser–Go dan Go–DS/ML. |
| Endpoint / route | Alamat dan metode suatu operasi. | POST /api/run. |
| GET / POST | Metode meminta informasi / mengirim data untuk diproses menurut endpoint. | GET /healthz; POST /analyze. |
| Request / response | Permintaan client / jawaban server. | Input FE / hasil Go. |
| Body / payload HTTP | Isi pesan HTTP. | JSON; berbeda dari payload alat sains misi. |
| Header | Informasi pendamping di luar body. | Content-Type, X-Request-ID. |
| Content-Type | Jenis isi pesan. | Go meminta application/json. |
| JSON | Format teks data terstruktur. | `{ "run_ml": false }`. |
| Object | Kumpulan nama dan nilai di dalam `{}`. | `"site": {"id":"demo"}`. |
| Field / key / property | Nama bagian data. | latitude_deg. |
| Value | Isi field. | 600 pada step_seconds. |
| String | Teks dalam tanda kutip. | `"direct_only"`; timestamp juga string JSON. |
| Number / integer | Angka / angka bulat. | 0.5 / 600. |
| Boolean | true atau false. | run_ml false melewati panggilan ML. |
| Null | Nilai kosong/tidak tersedia sesuai arti field. | Metrik null bukan hasil 0. |
| Array / list | Daftar dalam `[]`. | samples berisi urutan sampel. |
| Nested / dot path | Data bersarang / cara menunjuk lokasi field. | input.site.latitude_deg. |
| Envelope / wrapper | Pembungkus data utama. | Request membungkus data domain di input. |
| Domain data | Data masalah yang dikerjakan aplikasi. | Lokasi Bulan dan waktu. |
| Contract | Kesepakatan nama field, tipe, satuan, dan makna. | contracts/ masih usulan. |
| Schema / JSON Schema | Aturan bentuk data / bahasa aturan untuk JSON. | Go belum menjalankan schema domain ini. |
| Validator | Program yang memeriksa data menurut aturan. | File schema sendiri belum menjalankan pemeriksaan. |
| Placeholder | Nilai pengganti sementara. | TEAM_MUST_SPECIFY_FRAME bukan nama frame ilmiah. |
| Schema version | Versi kesepakatan bentuk data. | clps-analysis-v1; bukan versi Go. |
| `required` | Field yang harus ada menurut schema. | Tidak memeriksa kebenaran sains. |
| `properties` / `type` | Aturan tiap field / tipe nilai yang diperbolehkan. | Latitude tipe number. |
| `enum` / `const` | Salah satu nilai daftar / satu nilai yang harus cocok persis. | Daftar skenario / versi schema tertentu. |
| `minimum` / `maximum` | Batas bawah/atas yang masih termasuk. | Latitude -90 sampai 90. |
| `exclusiveMaximum` | Batas atas yang tidak termasuk. | Longitude kurang dari 360°. |
| `minLength` | Jumlah karakter minimum. | 1 menolak teks kosong, belum memastikan nama frame benar. |
| `additionalProperties: false` | Menolak field di luar definisi objek itu. | Go baru menolak nama tak dikenal pada envelope; domain schema belum diterapkan. |
| `format` | Penanda format seperti date-time atau uri. | Perlu dukungan/pengaturan validator yang sesuai. |
| `pattern` | Pola teks yang harus cocok. | Z$ meminta akhiran Z; sendirian belum membuktikan tanggal valid. |
| `default` | Nilai acuan dalam schema; tidak otomatis diterapkan. | Schema usulan false; Go saat field run_ml hilang tetap memanggil ML. |
| `allOf` | Semua aturan dalam daftar harus terpenuhi. | Aturan event dalam schema hasil. |
| `if` / `then` / `else` | Aturan bersyarat. | Status predicted membutuhkan waktu/durasi terisi. |
| `$schema` / draft 2020-12 | Penanda versi bahasa JSON Schema. | Berbeda dari schema_version data CLPS. |
| `title` / `description` | Penjelasan schema bagi pembaca. | Tidak menjalankan analisis. |

## Semua field request contoh

Sumber: examples/clps-request.fixture.json dan schema request. Aturan domain masih usulan.

| Field/nilai | Arti sederhana | Catatan |
| --- | --- | --- |
| `input` | Seluruh masukan analisis domain. | Harus objek agar diterima Go. |
| `run_ml` | Apakah perlu memanggil ML setelah DS. | false = lewati; true atau dihilangkan = panggil ML. |
| `input.schema_version` | Versi bentuk input. | clps-analysis-v1. |
| `input.site` | Informasi titik pengamat. | Bukan seluruh wilayah pendaratan. |
| `input.site.id` | ID titik. | synthetic-demo-site adalah contoh. |
| `input.site.latitude_deg` | Lintang dalam derajat. | Negatif ke selatan; -89 pada fixture adalah masukan contoh. |
| `input.site.longitude_deg_east` | Bujur ke timur menurut frame yang dipilih. | Usulan rentang 0 ≤ nilai < 360. |
| `input.site.observer_height_m` | Tinggi pengamat dalam meter terhadap acuan tertentu. | Angka 2 perlu height reference. |
| `input.site.body_fixed_frame` | Kerangka koordinat yang mengikuti rotasi Bulan. | Placeholder perlu kesepakatan DS. |
| `input.time` | Periode dan langkah waktu. | Kelompok tiga field berikut. |
| `input.time.start_utc` | Awal evaluasi. | Timestamp UTC. |
| `input.time.end_utc` | Batas akhir evaluasi. | Akhir tidak termasuk interval dalam usulan. |
| `input.time.step_seconds` | Jarak antarwaktu hitung dalam detik. | 600 = 10 menit; bukan durasi seluruh evaluasi. |
| `input.earth_elevation_margin_deg` | Margin sudut untuk aturan visibilitas Bumi. | Dapat ditafsirkan sebagai tambahan clearance terhadap horizon; formula final belum ditetapkan/dihitung. |
| `input.relay_scenario_id` | Nama kategori skenario. | Nama saja belum mendefinisikan orbit/node. |
| `direct_only` | Skenario tanpa relay. | Baseline direct Earth. |
| `one_relay` / `two_relays` | Skenario satu/dua relay. | Masih memerlukan konfigurasi lengkap. |
| `mother_children` | Relay utama dan node kecil. | Baru nama pilihan. |
| `rim_node_relay` | Node permukaan dan relay. | Baru nama pilihan. |

## Pembungkus respons Go dan output stub saat ini

Sumber: backend/main.go, ds/server.py, ml/server.py. File fixture hasil DS tidak otomatis menjadi output service.

| Field/nilai | Makna | Perilaku sekarang |
| --- | --- | --- |
| `status: ok` pada Go | Pemanggilan wajib alur selesai dengan JSON yang diterima backend. | Tidak mengesahkan akurasi sains/keberhasilan misi. |
| `request_id` | ID satu request backend. | Cocok dengan header X-Request-ID dan ID yang diteruskan. |
| `ds` | Respons JSON layanan DS. | Sekarang berisi stub. |
| `ml` | Respons ML atau keterangan dilewati. | run_ml false → status skipped. |
| `ds_result` | Nama field hasil DS pada request Go ke ML. | Bukan nama utama pembungkus respons Go. |
| `status: stub_only` | Layanan memberi respons integrasi sementara. | Belum hasil sains. |
| `status: skipped` | Tahap sengaja dilewati. | ML jika flag false. |
| `service` | Nama komponen pengirim respons. | ds atau ml. |
| `received` | Salinan payload yang diterima stub. | Untuk memeriksa jalur data. |
| `note` | Penjelasan tambahan stub. | Implementasi perlu ditambahkan. |
| `status: error` | Kegagalan dari backend. | Ada objek error. |
| `error.code` / `error.message` | Kode untuk program / penjelasan bagi pembaca. | ds_timeout / keterangan timeout. |

## Semua kelompok dan field hasil DS usulan

Sumber: examples/clps-ds-result.fixture.json dan schema hasil DS. Field yang hanya ada di schema juga dijelaskan.

| Field/nilai | Arti sederhana | Hal yang perlu dipahami |
| --- | --- | --- |
| `schema_version` | Versi kontrak hasil DS. | clps-result-v1. |
| `data_state` | Status/asal hasil secara umum. | fixture, computed, unavailable. |
| `fixture` | Data contoh pengembangan. | Bukan pengukuran/perhitungan lunar nyata. |
| `computed` | Perhitungan sudah dijalankan. | Belum otomatis tervalidasi atau akurat. |
| `unavailable` pada data | Hasil tidak bisa disediakan untuk kasus itu. | Perlu penjelasan alasannya. |
| `analysis_id` | Identitas hasil analisis. | Berbeda dari ID request; penyimpanan/ID final belum dirancang. |
| `site` | Titik pada hasil. | site.id, site.latitude_deg, site.longitude_deg_east, site.observer_height_m, site.body_fixed_frame memiliki arti seperti field input.site di atas. |
| `time` | Periode dan langkah hasil. | time.start_utc, time.end_utc, time.step_seconds memiliki arti seperti input.time; kelak merekam normalisasi DS. |
| `conventions` | Kesepakatan cara membaca angka. | Unit, arah, waktu, aturan visibilitas. |
| `conventions.azimuth` | Cara menghitung arah. | clockwise_from_local_north = dari utara lokal searah jarum jam. |
| `conventions.angle_unit` | Satuan sudut. | deg = derajat. |
| `conventions.time_scale` | Skala waktu hasil. | UTC; jangan campur langsung dengan skala internal hitungan astronomi. |
| `conventions.duration_unit` | Satuan selang waktu. | s = detik. |
| `conventions.interval` | Aturan batas awal/akhir. | start_inclusive_end_exclusive = [start,end). |
| `conventions.observer_height_reference` | Acuan tinggi pengamat. | TEAM_MUST_SPECIFY_REFERENCE masih placeholder. |
| `conventions.sun_visibility_rule` | Aturan kapan Matahari dianggap terlihat. | Perlu disk/threshold/penghalang yang jelas. |
| `conventions.earth_visibility_rule` | Aturan kapan Bumi dianggap terlihat. | Pusat disk, sebagian disk, atau lainnya perlu dipilih. |
| `skyline` | Daftar profil medan menurut arah. | [] pada fixture tidak berarti horizon datar. |
| `skyline[].azimuth_deg` | Arah satu titik profil. | [] pada path berarti setiap elemen daftar. |
| `skyline[].elevation_deg` | Sudut batas medan pada arah tersebut. | Bukan ketinggian medan dalam meter. |
| `samples` | Daftar hasil tiap waktu sampel. | [] berarti belum ada elemen. |
| `samples[].time_utc` | Waktu satu sampel. | Bukan awal seluruh interval. |
| `samples[].sun_azimuth_deg` | Arah Matahari pada sampel. | Derajat menurut konvensi. |
| `samples[].sun_elevation_deg` | Sudut elevasi Matahari. | Terhadap horizontal lokal; belum otomatis berarti seluruh disk lolos medan. |
| `samples[].earth_azimuth_deg` | Arah Bumi. | Derajat. |
| `samples[].earth_elevation_deg` | Sudut elevasi Bumi. | Bandingkan horizon dan aturan disk. |
| `samples[].sun_visible_disk_fraction` | Bagian luas disk Matahari terlihat, 0 sampai 1. | 0.5 = separuh disk, bukan 50% daya panel. |
| `samples[].direct_earth_visible` | Apakah Bumi terlihat langsung menurut rule. | true/false; null jika belum tersedia. |
| `samples[].relay_path_visible` | Apakah jalur via relay lolos model pada sampel. | Usulan ini untuk relay; jangan diam-diam dicampur direct. |
| `summary` | Ringkasan seluruh periode. | Bukan nilai satu sampel; rinciannya di tabel berikut. |
| `events` | Informasi kejadian. | Sunset dan Earthset. |
| `relay` | Identitas skenario pada hasil. | Bukan seluruh parameter orbit. |
| `relay.scenario_id` | Nama kategori skenario hasil. | Sama pilihan dengan input.relay_scenario_id. |
| `relay.configuration_id` | ID konfigurasi lengkap yang dipakai. | null pada fixture; orbit/node final belum ada. |
| `provenance` | Jejak sumber/metode hasil. | Agar bisa ditelusuri. |
| `provenance.algorithm_version` | Versi metode/perangkat lunak penghasil. | null karena belum dihitung. |
| `provenance.datasets` | Daftar dataset yang dipakai. | [] bukan bukti sudah memakai data NASA. |
| `provenance.datasets[].filename` | Nama berkas sumber. | Terrain/kernel yang benar-benar dipakai kelak. |
| `provenance.datasets[].version_or_sha256` | Versi berkas atau hash SHA-256 pengenal isinya. | Hash tidak membuktikan sains benar. |
| `provenance.datasets[].source_url` | Alamat sumber dataset. | Bukan instruksi agar backend mengunduh URL arbitrer. |
| `warnings` | Daftar keterbatasan/catatan. | Fixture menyatakan belum ada perhitungan. |

## Metrik: perbedaan yang mudah tertukar

Semua adalah makna usulan; DS perlu menyepakati aturan, threshold, dan pembobotan. Contoh 10 jam hanya ilustrasi matematika.

| Field/istilah | Makna yang dituju | Contoh atau batasan |
| --- | --- | --- |
| `summary.mean_visible_solar_disk_fraction` | Rata-rata fraksi disk terlihat selama interval dengan bobot durasi. | Separuh disk terlihat terus 10 jam → 0.5. |
| `summary.sunlit_time_fraction` | Fraksi waktu yang memenuhi definisi bercahaya. | Jika sebagian disk sudah dihitung bercahaya, contoh di atas → 1, bukan 0.5. |
| `summary.longest_dark_interval_seconds` | Durasi gelap terpanjang di dalam interval menurut threshold. | Bukan penjumlahan semua periode gelap. |
| `summary.direct_earth_visible_fraction` | Fraksi durasi dengan Bumi terlihat langsung menurut rule. | 6 dari 10 jam → 0.6 atau 60%; belum menjamin radio. |
| `summary.longest_direct_gap_seconds` | Durasi terpanjang tanpa direct Earth dalam interval. | Berbeda dari periode gelap. |
| `summary.relay_assisted_visible_fraction` | Usulan fraksi waktu ada jalur direct ATAU relay menurut model. | Definisi gabungan ini perlu disepakati; belum dihitung kode. |
| `summary.longest_remaining_gap_seconds` | Usulan gap terpanjang sesudah jalur direct dan relay digabung. | Gap yang gagal ditutup konfigurasi. |
| Fraction / percentage | Fraksi / fraksi dikalikan 100. | 0.25 = 25%, bukan 0.25%. |
| Time-weighted | Setiap nilai diberi bobot sesuai durasi yang diwakili. | Langkah terakhir yang pendek tidak harus berbobot sama. |
| Threshold | Batas keputusan untuk mengubah nilai menjadi kondisi tertentu. | Batas dianggap gelap harus disepakati. |
| Boundary truncation | Kejadian terpotong awal/akhir interval data. | Gap 2 jam dapat merupakan bagian gap lebih lama di luar interval. |
| Delivered power | Daya yang benar-benar diterima/dihasilkan sistem. | Perlu model panel, arah, efisiensi, dll.; belum tersedia. |

## Event dan waktu

Sumber definisi usulan: schema hasil DS.

| Field/istilah | Arti sederhana | Contoh/aturan |
| --- | --- | --- |
| `events.sunset` | Transisi Matahari terlihat→tidak terlihat berikutnya setelah start menurut rule. | Sudah tersembunyi saat start bukan otomatis event baru. |
| `events.earthset` | Transisi Bumi terlihat→tidak terlihat berikutnya menurut rule. | Prinsip seperti sunset. |
| `events.sunset.status` / `events.earthset.status` | Status pencarian kejadian. | Empat nilai berikut. |
| `predicted` | Metode menghasilkan perkiraan waktu event. | Tidak harus ML; rumus geometri juga memprediksi. |
| `not_within_interval` | Event tidak ditemukan di periode yang diperiksa. | Bukan berarti tidak pernah terbenam selamanya. |
| `not_computed` | Event belum dihitung. | Nilai fixture sekarang. |
| `unavailable` pada event | Event tidak dapat disediakan untuk data/model/kasus itu. | Berbeda dari belum menjalankan hitungan. |
| `events.sunset.time_utc` / `events.earthset.time_utc` | Waktu perkiraan kejadian. | null kecuali status predicted menurut schema. |
| `events.sunset.seconds_from_start` / `events.earthset.seconds_from_start` | Jarak event dari start_utc, dalam detik. | Event 01:00, start 00:00 → 3600; bukan countdown dari jam sekarang. |
| UTC | Skala waktu acuan kontrak ini. | Tidak sama dengan waktu lokal WIB. |
| Timestamp | Penanda tanggal dan waktu. | 2026-11-14T00:00:00Z. |
| T / Z pada timestamp | Pemisah tanggal-jam / penanda offset UTC nol. | 00:00Z = 07:00 WIB pada tanggal yang sama. |
| WIB | Waktu Indonesia Barat, UTC+7. | UI boleh tampil lokal, kontrak mengirim UTC. |
| `[start,end)` | Awal termasuk, akhir tidak termasuk. | Sampel/event tepat di end di luar interval usulan. |
| Countdown | Sisa waktu dari waktu acuan tertentu ke event. | Cursor timeline berubah → hitung dari cursor, bukan selalu start. |


## Docker dan jaringan proyek

Dasar container: [Docker Docs](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/). Compose: [model aplikasi resmi](https://docs.docker.com/compose/intro/compose-application-model/). Konfigurasi/nilai khusus di bawah diperiksa dari compose.yaml, Dockerfile, dan Nginx proyek.

| Istilah | Arti sederhana | Perilaku/konteks proyek |
| --- | --- | --- |
| Docker | Perangkat membangun dan menjalankan aplikasi dalam container. | Memisahkan lingkungan Go, Python, dan Nginx. |
| Docker Desktop / Engine | Aplikasi pengelola / komponen yang menjalankan container. | Desktop dibuka perlu diikuti Engine siap. |
| Image | Paket/template berkas dan konfigurasi untuk menjalankan container. | Dibangun dari Dockerfile. |
| Container | Proses aplikasi dengan lingkungan yang diisolasi runtime. | Bukan otomatis komputer fisik terpisah. |
| Dockerfile | Resep membangun image dan cara program dijalankan. | Ada di setiap folder service. |
| Build | Membuat image dari resep dan kode. | up --build. |
| Docker Compose | Pengatur beberapa service dari satu konfigurasi. | compose.yaml. |
| YAML | Format teks konfigurasi dengan indentasi. | Salah indentasi dapat mengubah struktur. |
| `services` | Definisi komponen Compose. | frontend, backend, ds, ml. |
| `build: ./backend` | Lokasi sumber build service. | Path relatif pada konteks konfigurasi. |
| Network | Jalur komunikasi komponen. | Jaringan Compose menghubungkan service. |
| Service name / DNS internal | Nama pencarian alamat service di jaringan Docker. | Go menghubungi http://ds:8001. |
| Host | Komputer/lingkungan yang menjalankan Docker. | Browser Windows mengakses port host. |
| Port | Nomor tempat proses menerima koneksi. | DS 8001; ML 8002; Go 8080 internal. |
| Port mapping / `ports` | Penghubung port host dengan port container. | 8080:80 = host 8080 → frontend container 80. |
| `expose` / `EXPOSE` | Informasi port internal, tidak menerbitkan port host. | Bukan firewall dan tidak sendirian menentukan akses antarkontainer. |
| `localhost` / `127.0.0.1` | Lingkungan jaringan proses itu sendiri. | Di backend container berarti backend sendiri, bukan DS. |
| `0.0.0.0` | Alamat bind semua antarmuka IPv4 lokal proses. | DS/ML memakainya agar dapat menerima koneksi dari container lain; bukan nama tujuan request. |
| Bind / listen | Membuka alamat/port untuk menerima koneksi. | Go listen :8080. |
| Environment variable | Pengaturan yang dibaca dari lingkungan program. | DS_URL, ML_URL, timeout. |
| `.env` | File yang dapat dipakai Compose untuk substitusi pengaturan. | Go ini membaca environment, bukan otomatis membuka file .env. |
| `DS_URL` / `ML_URL` | Tujuan service yang dipakai Go. | Default http://ds:8001 / http://ml:8002. |
| `REQUEST_TIMEOUT` | Batas waktu gabungan DS dan ML. | Default 20s; health check punya batas tersendiri. |
| `SHUTDOWN_TIMEOUT` | Batas menunggu request aktif saat shutdown Go. | Default 10s; yang belum selesai dapat dihentikan setelah batasnya. |
| `LOG_LEVEL` | Tingkat log yang ditampilkan. | INFO default; DEBUG, WARN/WARNING, ERROR dikenali; nilai lain jatuh ke INFO. |
| `${VAR:-nilai}` | Pakai VAR, atau nilai pengganti jika kosong/tidak ada. | ${REQUEST_TIMEOUT:-20s}. |
| `depends_on` | Ketergantungan/urutan startup. | Konfigurasi ini menunggu service_healthy; tidak menjamin layanan selalu sehat sesudah startup. |
| Health check | Pemeriksaan status/kesiapan berkala. | Didefinisikan untuk DS/ML/Go. |
| `interval`, `timeout`, `retries` health check | Jarak antarcek, batas satu cek, kegagalan beruntun sebelum unhealthy. | Berbeda dari interval analisis lunar. |
| Liveness / `/livez` | Handler Go masih menjawab. | Tidak memanggil DS/ML; internal backend. |
| Readiness / `/healthz` | Kesiapan ketergantungan alur lengkap. | Memeriksa DS dan ML; run_ml false tidak menghapus syarat startup ML. |
| `stop_grace_period` | Waktu menunggu penghentian normal sebelum Docker memaksa berhenti. | Backend 30s; selaraskan timeout Go. |
| Nginx | Web server/proxy. | Menyajikan index.html dan meneruskan /api/ ke Go. |
| Reverse proxy | Server depan yang meneruskan request ke server tujuan. | Browser → Nginx → Go. |
| Same origin | Skema, host, dan port browser sama untuk halaman dan API. | FE memakai /api/run relatif di localhost:8080. |
| CORS | Aturan browser untuk akses respons antar-origin. | Alur same-origin ini tidak memerlukan CORS lintas-origin; bukan mekanisme login. |
| `proxy_read_timeout` | Batas Nginx menunggu antaroperasi baca respons upstream. | 30s; bukan batas durasi fenomena lunar. |
| Multi-stage build | Build program dalam satu stage, salin hasil ke stage akhir. | Go builder → Alpine untuk runtime. |
| Alpine | Distribusi Linux dasar image. | Versi tag image berbeda dari versi kode aplikasi. |
| `FROM` | Pilih image dasar/stage. | golang, python, nginx, alpine. |
| `WORKDIR` / `COPY` | Direktori kerja / salin berkas ke image. | Source masuk image saat build. |
| `RUN` | Perintah saat build. | Kompilasi Go. |
| `CMD` / `ENTRYPOINT` | Perintah/default program saat container dijalankan. | Python CMD; backend ENTRYPOINT. |
| `USER` / non-root | Akun pengguna proses. | Go/Python disetel memakai non-root. |
| Bind mount / volume | Cara memasang direktori/penyimpanan ke container. | Belum didefinisikan Compose ini; edit source perlu build ulang agar masuk image. |
| `up --build` / `up -d --build` | Build/jalankan; -d berjalan di latar belakang. | Pakai setelah source berubah. |
| `ps` / `logs -f` / `down` | Lihat status / ikuti log / hentikan-hapus container dan jaringan Compose terkait. | Perintah pengelolaan, bukan route API. |

## Error, kode Go, tes, dan Git

Dasar server: [Go net/http](https://pkg.go.dev/net/http). Nilai/perilaku khusus diperiksa dari main.go, Dockerfile, dan main_test.go.

| Istilah | Arti sederhana | Contoh/perilaku proyek |
| --- | --- | --- |
| HTTP status code | Angka hasil request. | Lihat juga body error. |
| 200 / 2xx | Operasi diterima sebagai sukses menurut endpoint. | Stub juga bisa 200. |
| 400 / `invalid_request` | Bentuk request ditolak. | Input hilang/bukan objek; JSON rusak; field envelope tak dikenal. |
| 413 / `request_too_large` | Body melampaui batas Go. | Batas 1 MiB. Nginx dapat menolak lebih dulu dengan format error berbeda. |
| 415 / `unsupported_media_type` | Jenis isi tidak didukung handler. | Content-Type bukan application/json. |
| 502 / `ds_request_failed`, `ml_request_failed` | Layanan tujuan gagal atau respons ditolak. | Non-2xx, JSON rusak, respons terlalu besar, gangguan transport. |
| 504 / `ds_timeout`, `ml_timeout` | Deadline habis saat pemanggilan layanan. | Menunggu terlalu lama. |
| 503 / `ds_unavailable`, `ml_unavailable` | Ketergantungan belum siap pada health check. | Status /healthz Go. |
| 404 / 405 | Route tidak ditemukan / metode tidak diizinkan. | Error di luar handler /api/run tidak semuanya JSON. |
| KiB / MiB | Satuan berbasis 1024. | 1 MiB = 1.048.576 byte. Stub Python membatasi body 1.000.000 byte; berbeda. |
| Timeout / deadline | Lama tunggu maksimum / titik waktu paling lambat. | Konteks bersama membatasi DS+ML, bukan 20s penuh masing-masing secara berurutan. |
| Upstream / downstream | Istilah relatif terhadap komponen pembicara. | Go menyebut DS/ML downstream; Nginx menyebut Go upstream. |
| Request ID / tracing | ID untuk menghubungkan jejak request. | Belum sistem distributed tracing lengkap. |
| Log | Catatan kejadian program. | Method, path, status, durasi, error. |
| Structured logging / `slog` | Log dengan field terstruktur. | JSON yang dapat dicari berdasarkan request ID. |
| Middleware | Pembungkus handler untuk perilaku bersama. | Pemberian ID dan logging. |
| Handler | Penangan request. | POST /api/run. |
| Router / ServeMux | Pemilih handler menurut route/metode. | Bawaan Go. |
| Context / cancellation | Pembawa deadline/pembatalan proses. | Dipakai dalam request Go ke DS/ML. |
| Graceful shutdown | Berhenti menerima pekerjaan baru dan memberi request aktif kesempatan selesai sampai batas waktu. | Bukan jaminan semua request selesai. |
| SIGTERM | Sinyal penghentian proses yang lazim dikirim stop container. | Go memulai shutdown saat menerimanya. |
| Serialize / marshal | Mengubah data menjadi JSON untuk dikirim. | json.Marshal. |
| Decode / unmarshal | Membaca JSON menjadi struktur program. | Memeriksa envelope request. |
| json.RawMessage | Tipe Go penyimpan bagian JSON untuk diteruskan tanpa struct seluruh field. | Input, hasil DS/ML. |
| Struct / interface | Tipe data berisi field / kontrak perilaku tipe Go. | runRequest / http.Handler. |
| Goroutine / channel | Mekanisme pekerjaan bersamaan / pertukaran pesan Go. | Server berjalan pada goroutine dan mengirim error lewat channel. |
| Module / go.mod | Identitas modul dan pengaturan dependensi/versi bahasa. | Modul backend-integration-sandbox/backend. |
| Compile / binary | Menerjemahkan source jadi program / hasilnya. | Build menghasilkan executable backend. |
| CGO_ENABLED=0 / GOOS=linux | Build tanpa dukungan cgo / target Linux. | Opsi build backend container. |
| -trimpath / -ldflags="-s -w" | Mengurangi path sumber / metadata simbol-debug pada binary. | Bukan pembuktian bebas bug. |
| Automated test | Program yang memeriksa perilaku tertentu. | main_test.go. |
| Integration test | Pemeriksaan pertukaran data antarkomponen atau penggantinya. | DS result sampai ke ML/FE. |
| go test | Menjalankan tes Go. | Kasus lolos tidak membuktikan akurasi lunar. |
| go vet | Pemeriksaan statis pola kode Go yang mencurigakan. | Berbeda dari menjalankan Docker. |
| Git / repository | Sistem riwayat perubahan / kumpulan berkas dan riwayatnya. | Repository bukan container. |
| Commit / push | Rekaman perubahan lokal / kirim commit ke remote. | Commit belum otomatis terkirim ke GitHub. |
| Remote / origin | Repository tujuan/sumber di luar lokal / nama remote umum. | URL GitHub. |
| .gitignore | Pola berkas yang diabaikan Git jika belum dilacak. | .env, cache, file Python tertentu. |
| Cache | Hasil sementara untuk mempercepat proses berikutnya. | Build cache bukan database analisis. |
| Artifact | Berkas hasil proses yang dapat dipakai ulang. | JSON prahitung; API artifact belum dibuat. |
| Synchronous | Client menunggu proses selesai pada request yang sama. | /api/run sekarang. |
| Asynchronous job / queue | Pekerjaan diproses terpisah, biasanya dengan ID/status. | Belum ada. |
| Pagination | Membagi daftar hasil menjadi beberapa halaman/bagian. | Belum ada. |
| Database | Penyimpanan terstruktur yang dikelola sistem tertentu. | Belum digunakan proyek. |
| JWT / authentication | Format token bertanda tangan / pemeriksaan identitas. | Belum ditambahkan; berbeda dari validasi JSON. |

## Membaca file yang sedang terbuka

| Jika melihat... | Bacanya... |
| --- | --- |
| data_state fixture | Ini data contoh, belum hasil lunar nyata. |
| skyline [] dan samples [] | Belum ada elemen profil/sampel; bukan bukti horizon datar. |
| metrik null | Nilai belum tersedia; jangan ubah otomatis menjadi 0 atau 0%. |
| sunset status not_computed | Belum ada perhitungan sunset. |
| algorithm_version null dan datasets [] | Belum ada metode/dataset hasil hitungan yang dicantumkan. |
| TEAM_MUST_SPECIFY_FRAME | Pengingat agar frame dipilih, bukan frame yang sudah valid. |
| run_ml false | Panggil DS, lewati ML untuk request itu; Compose tetap menjalankan ML. |
| Go status ok dan ds.status stub_only | Jalur HTTP selesai, DS masih pengganti sementara. |

## Alur pengujian API di integration.html

| Urutan | Yang terjadi sekarang | Pemilik pekerjaan |
| --- | --- | --- |
| 1 | Browser membuka localhost:8080/integration.html; Nginx menyajikan halaman API. | FE + konfigurasi Docker |
| 2 | FE mengirim POST /api/run berisi input JSON. | FE |
| 3 | Go memeriksa envelope, memberi ID, dan memanggil DS /analyze. | Backend |
| 4 | DS stub mengembalikan stub_only dan salinan request. | DS mengganti stub dengan analisis nyata |
| 5 | run_ml false → skipped. True/dihilangkan → Go mengirim input+ds_result ke ML /predict. | Backend; prediksi milik ML |
| 6 | Go mengirim ds dan ml ke FE. | Backend |
| 7 | Halaman API menampilkan JSON; grafik ilustrasi terpisah berada di index.html dan belum terhubung ke DS. | FE |

Keterangan kata tidak berarti fitur tersebut sudah tersedia. Sumber web definisi tambahan diperiksa saat ditulis; fakta program mengacu pada file yang disebut di atas.


Catatan UI: index.html adalah demo alur dengan angka/lintasan buatan frontend; tidak memanggil API. Tombol pengujian API membuka integration.html. Skenario tersimpan hanya di memori halaman dan hilang saat reload.

## Istilah perluasan relay, rover dan daya

| Istilah | Arti |
| --- | --- |
| Planned-relay coverage (cakupan relay terencana) | Kapan lander bisa berkomunikasi lewat satelit relay yang direncanakan (Lunar Pathfinder, jaringan Intuitive Machines, Moonlight): lander melihat relay di atas skyline dan relay melihat Bumi pada saat yang sama. |
| Rover reach (jangkauan rover) | Wilayah yang bisa dicapai rover dari sebuah situs dalam satu bulan lunar sambil tetap terkena matahari dan terhubung (langsung ke Bumi atau lewat relay). |
| Corridor (koridor) | Pita jalur yang memenuhi syarat cahaya dan komunikasi pada resolusi medan 20 m; bukan rute yang pasti bisa dilalui (batu tidak terlihat). |
| Safe haven (tempat aman) | Titik yang tetap terkena matahari saat Bumi tidak terlihat; rover menunggu di sana (istilah perencanaan VIPER). |
| Power potential (potensi daya) | Bagian cakram Matahari yang terlihat × faktor sudut datang pada panel; 0–1, **bukan watt**. |
| Mast-height what-if (simulasi tinggi tiang) | Hitung ulang skyline dengan panel lebih tinggi untuk melihat berapa banyak sinar matahari yang bertambah. |

## Istilah halaman Explore

| Istilah | Arti |
| --- | --- |
| Parallax / scroll-driven page (halaman parallax) | Halaman yang satu objeknya (di sini Bulan 3D) tetap di layar dan berubah mengikuti posisi scroll, sementara teks chapter bergulir di atasnya. Yang bergerak hanya kamera; cahaya Matahari tetap dari ephemeris SPICE. |
| Chapter (bab) | Satu bagian halaman Explore dengan satu temuan dari data pipeline dan tautan ke alat lengkapnya (lesson, situs 3D, planner). |
| Synodic month (bulan sinodis) | Sekitar 29,53 hari, dari satu fase Bulan ke fase yang sama berikutnya; setelah itu Matahari menyinari Bulan dari sisi yang hampir sama. |
| Sub-solar / sub-Earth point (titik sub-matahari / sub-Bumi) | Titik di permukaan Bulan tempat Matahari atau Bumi tepat berada di atas kepala pada suatu waktu. |
| Libration (librasi) | "Goyangan" Bulan dilihat dari Bumi, sehingga Bumi bergeser beberapa derajat di langit Bulan selama sebulan. |

## Istilah desain konstelasi relay

| Istilah | Arti |
| --- | --- |
| Pareto front (garis Pareto) | Kumpulan opsi yang tidak dikalahkan opsi lain pada semua tujuan sekaligus. Pareto hanya menyaring hasil simulasi dan tidak menentukan satu pemenang. |
| Dominated (terkalahkan) | Ada opsi lain yang sama baik atau lebih baik pada semua tujuan, dan lebih baik pada setidaknya satu tujuan. |
| NSGA-II | Non-dominated Sorting Genetic Algorithm II. Algoritma evolusi untuk mencari perkiraan Pareto front ketika kombinasi terlalu banyak untuk dites semua. |
| Grid search (pencarian kisi) | Mengetes semua kandidat dari daftar nilai yang sudah ditentukan. Hasilnya pasti untuk kandidat yang dites. |

