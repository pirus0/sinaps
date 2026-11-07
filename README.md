# Özet
Bağımlılıksız, Türkçe, mobil öncelikli Dallanan Not web/PWA prototipi.
Veri cihazın localStorage alanında; hesap ve sunucu kaydı yok.
Ağaç modeli gece önerisi; kullanıcı onayı bekliyor. Kapsam: FIKIR.md §3–5.
Durum: prototip v1 çalışıyor; testler ve ekranlar `../ekran/` içinde.

## Çalıştırma
Bu dizinde `npm start`, ardından `http://127.0.0.1:4173`.
`PORT=4180 npm start` ile port değişir. Statik dosyalar HTTPS altında da sunulabilir.
PWA için HTTPS veya localhost gerekir; ilk çevrimiçi açılıştan sonra çevrimdışı çalışır.

## Doğrulama
`npm test`: Node'un yerleşik test sistemiyle veri, taşıma/sıralama/silme ve yedek turu.
`npm run test:browser`: Playwright; iPhone 13 (390×844), masaüstü, taşma ve kullanıcı akışları.
Tarayıcı testi yerel veya global `playwright` kurulumunu kullanır; çalışma zamanı bağımlılığı yoktur.
Ekran görüntüleri `../ekran/` içinde.
`npm run test:faults`: dolu depo, bozuk kayıt, iki sekme ve paylaşım iptali/hatası.

## Veri
`dallanan-not-data-v1` anahtarında sürümlü `surum/notlar/baglar` yapısı.
JSON yedeği notları kimliğe göre birleştirir; cihazdaki sürüm korunur, öncesinde onay istenir.
Numaralı `.txt` dışa aktarma şiirlerin satırlarını korur; metin içe aktarılmaz.
Tarayıcı verileri temizlenirse cihazdaki kayıt silinir; Ayarlar → Yedek ile dosya alınabilir.
Geist ve Bricolage Grotesque yazı tipleri yereldir; lisanslar `fonts/` altında.
Test ayrıntısı ve gerçek cihazda kalan kontroller: `DOGRULAMA.md`.
