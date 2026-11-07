# Doğrulama

## Güncel durum
- Çalışma zamanı bağımlılığı yok; HTML/CSS/JS, Node'un yerleşik statik sunucusu ve test sistemi.
- 16 mantık testi: her veri işlemi, JSON gidiş-dönüş, birleştirme, arama, şiir ve 300 seviye derinlik.
- 7 Playwright akışı: Chromium 375/430 açık-koyu + masaüstü 1440×900; WebKit iPhone 13 390×844 açık-koyu.
- 5 ek hata/kurtarma senaryosu: paylaşım sözleşmesi/iptal, paylaşım hatasında indirme, dolu depo,
  iki sekme çakışması, bozuk kaydı koruma ve ham dışa aktarma.
- Sonuç dosyaları ve ekranlar `../ekran/`; işletim sistemi paylaşım penceresi ve gerçek iOS klavyesi
  otomasyonla doğrulanmış sayılmaz.

## Akışlarda sınananlar
Dal oluşturma, otomatik kayıt ve gezinirken bekleyen kaydı hemen yazma; Enter'ın satır sonu kalması;
boş taslağı terk etme; dalsız şiiri satırları/boşluklarıyla numarasız indirme; Türkçe arama ve yol;
taşıma ve döngü yaratacak hedeflerin pasifliği; tek not silme, alt dallarla silme onayı ve vazgeçme;
silme/taşıma/sıralama/yükleme için tek adım geri alma; sıralama panelinin açık kalması;
JSON indirme, aynı yedeği iki kez yükleme, yenileri birleştirme ve hatalı yedeği reddetme;
son açık notta yeniden açılma; 9 seviye yol, uzun şiir ve dal kısayolu; çevrimdışı açılma/düzenleme.
Son tasarıma göre taşıma hedefi seçilir ve Taşı ile onaylanır. Menüde sıra göstergesi güncellenir;
Sistem/Açık/Koyu seçimi ve başlığa çift dokunuşla tema değişir. Paneller geçmişe girer; geri önce
paneli kapatır, ayar alt panellerinden Ayarlar'a döner. Tarayıcı geri/ileri ayrıca sınandı.

Kontrol edilen görünür düğme/girişlerin dokunma alanı en az 44 px. Yatay taşma, görünüm dışına çıkan
düğme, uygulama JS hatası ve dış ağa giden istek bulunmadı. Yazı tipleri ve simgeler yerel.

## Çevrimdışı kontrol yöntemi
Chromium'da Playwright `setOffline(true)` ile yeniden açma ve düzenleme geçiyor.
WebKit'te bu bayrak service worker ile iç navigasyon hatası üretti; gerçek HTTP sunucusu kapatılarak
aynı kontrol yapıldı ve açık/koyu iki durumda da uygulama önbellekten açılıp düzenlemeyi kaydetti.

## Hata davranışları
Depo dolarsa eski kayıt korunur, kaydedilemeyen güncel metin bellekte kalır ve JSON yedekten alınabilir.
Bozuk kayıt boş veriyle değişmez; yazma kilitlenir, ham dosya Yedek üzerinden kurtarılabilir.
Başka sekmenin yeni kaydı algılanınca eski sekmede yazma/yükleme kilitlenir; metin yedeklenebilir.
Web Share sözleşmesi tarayıcıda sahte API ile gerçek File içerikleri üzerinden test edildi. İptal
son yedek zamanını ilerletmez; diğer hatalarda gerçek indirme alternatifi çalışır.

## Gerçek cihazda kalanlar
- iOS ana ekrana kurma, yerel paylaşım penceresinde JSON/TXT dosyası seçip gerçekten Dosyalar'a kaydetme.
- Yerel klavye açılırken `visualViewport` ile Üst/Dal çubuğunun başparmak bölgesinde kalması.
- Safari sekmesinden ana ekran PWA'sına geçerken depo ayrılığı; önce JSON yedekle geçiş denenmeli.
- `navigator.storage.persist()` ilk kayıtta istenir; tarayıcının kabulü garanti edilmez.

## Kaynaklar
Görsel kararlar `../ARAYUZ.md` ve `../Tasarim/`; ürün/veri kararları `../FIKIR.md` ve
`../FIKIR-durumlar.md`. Teknik araştırma `../ARASTIRMA.md` §6–7.
Font kaynakları Google Fonts `ofl/geist` ve `ofl/bricolagegrotesque`; SIL OFL lisansları `fonts/` içinde.
