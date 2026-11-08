# Özet
Sinaps: mobil PWA, kare tuval ızgarası, serbest kart/ip, cihazda veri.
Fotoğraf yalnız JPEG 1080; Sade PNG, Tam A4 PDF, yeni kimliklerle .sinaps kopyası.
Genel/tuval araması, merkez, 30 günlük tuval çöpü; kart silme onaylı.
Durum: çalışan prototip; test kanıtı ve cihazda kalanlar DOGRULAMA.md içinde.

## Çalıştırma
`npm start` → http://127.0.0.1:4173. Başka port: `PORT=4180 npm start`.
Derleme/kurulum gerekmez. Statik HTTPS sunum ve localhost PWA destekler.

## Kullanım
Tuval karesine dokun → aç; uzun bas → Adlandır/Sil. Kartı beklemeden sürükle.
Sağ uçtan karta çek → ip; boşluğa çek → yeni dal. Uca dokun → hedef seç.
Kart → yazı sayfası; Dal/Tamam. Açıklamada Enter satır sonudur.
Boşlukta kaydır, iki parmakla yakınlaştır. Kırmızı düğme/tuval adı merkeze döner.
Sade alt sağ Paylaş → Kopya/PDF/Görsel. PDF 12/14 pt, A4 ve 10 mm bindirme;
12 sayfayı aşarsa Oluştur onayı. Paylaşım izni düşerse Gönder ile yeniden dokun.
Ana ekranda genel arama; tuvalde arama yalnız o tuvalde. Silinen tuval Çöp'ten
Kurtar ile döner; açılışta 30 günü dolanlar silinir. Kart silme geri alınmaz.

## Veri
Kart/ip/tuval: localStorage `dallanan-not-data-v3`; görünüm ayrı v3 anahtarında.
Fotoğraflar IndexedDB `sinaps-fotograflar`; her dosya JPEG kalite .7, uzun kenar
≤1080 olarak yeniden kodlanır, küçük görsel büyütülmez, asıl dosya saklanmaz.
v1/v2 göçünde eski anahtarlar silinmez. Yedek fotoğrafları ve çöpü içerir;
Yükle yedeği kimlikle birleştirir, cihaz kazanır. .sinaps her seferinde yeni
kimlikli tuval ekler. PNG/PDF/TXT geri yüklenebilir yedek değildir.

## Test ve kaynaklar
`npm test`; `npm run test:browser`, `test:faults`, `test:png`, `test:photos`,
`test:pdf`, `test:library`, `test:quick`. Tarayıcı testleri yerel/global Playwright
ve Chromium/WebKit kullanır. Ekran/PDF örnekleri `../ekran/sinaps/` içinde.
Çalışma zamanı yalnız PDF için yerel pdf-lib/fontkit: `vendor/README.md`.
Ad/simge tek kaynak `brand.js`; `npm run icons` PWA ikonlarını üretir.
Yerel fontlar ve OFL lisansları `fonts/`; PDF 600/700 örnekleri aynı fontlardan.
Native iOS ve App Store adresi henüz yok; kopyanın yanındaki adres şimdilik web.
