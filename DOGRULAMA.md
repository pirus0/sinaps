# Sinaps doğrulama

## Güncel durum
- 57 Node testi: v1 uyumluluk, kart/ip işlemleri, v3 tuval ayrımı/göç, geometri/PNG, PDF sayfalama,
  kopya kimlik eşlemesi, genel arama ve 30 günlük çöp sınırı.
- 7 ana Playwright akışı: Chromium 375/430 açık-koyu, iPhone 13 390×844, masaüstü 1440;
  WebKit iPhone 13 390×844 koyu. Fotoğraf/PNG/JSON/çevrimdışı/merkez akışları geçti.
- 4 ek kütüphane akışı: 375 açık, 430 koyu, WebKit 390, masaüstü; arama, kopya ve çöp.
- 5 hata/kurtarma senaryosu; iki motorda toplam 12 PNG/göç kontrolü; fotoğraf depo testleri.
- İki motorda gerçek PDF ve >12 onayı/Gönder; bağımsız PyMuPDF ile A4/font/Türkçe/JPEG/12–14 pt.
- Tasarım karşılaştırması 1–16 kapalı (arayüz d494a3b). Kanıtlar `../ekran/sinaps/` içinde.

## Ana kullanım
Yeni tuval → kart → Dal/Tamam, başlık Enter'ı açıklamaya geçirir, açıklama Enter'ı satır sonudur.
Boş yeni kart temizlenir; şiir boşlukları korunur. Tuval başına ayrı kamera/kartlar, kare ana ızgara,
porttan mevcut karta ip ve boşluğa yeni dal, yinelenen ipin engellenmesi gerçek pointer akışıyla sınandı.
Kart beklemeden hareket ediyor; nokta ızgarası kameraya bağlı. CDP iki parmak zoom, veri değişmezliği,
Tam merkez ölçek 1 ve Sade'de sığdırmayı koruma sınandı. Bu, fiziksel iPhone jest testi değildir.

## Fotoğraf ve yedek
1600×900 girdi → JPEG 1080×608, kalite .7. Küçük 16×10 ve 80×40 görseller büyütülmeden yeniden JPEG.
Asıl dosya/değeri localStorage'a konmuyor; IndexedDB'deki JPEG tam ekran görüntüleniyor.
WebKit'in Blob hazırlama UnknownError durumunda aynı JPEG baytları ArrayBuffer olarak IndexedDB'ye
saklanır; okuma API'si Blob döndürür. Böylece WebKit'te de yedek ve çevrimdışı açılış geçti.

JSON fotoğraf baytlarını base64 taşır. Boş tarayıcı bağlamında içe yükleyip görseli açma, aynı yedeği
tekrar yükleme, cihazdaki fotoğraf kimliğinin kazanması, bozuk görsel/yedeği reddetme sınandı.
Bozuk kayıt doğrulaması tüm fotoğraflar yazılmadan yapılır. Kaldır/Geri al sonrası 6.6 saniye beklenince
fotoğraf korunuyor; onaylı kart silme fotoğrafı da siliyor. Başka kartlar tutuluyor.

## PNG ve dosya paylaşımı
Negatif/uzak/kopuk üç kart: 2924×984 PNG, piksel/decode doğrulaması, ayrı sağ alt Sinaps filigranı,
arka plan ve yüzeyler sınandı. 2x bütçeyi aşarsa 1x/uygun ölçek, kırpma yok. Açıklama değişikliği Sade
PNG bitlerini değiştirmedi. Fotoğraf minyatürünün PNG'de gerçek pikselleri ve merkez/adı doğrulandı.
Grid ekrana ait, çıktıya girmez. null Blob'da hata ve pasif Görsel; gerçek PNG File,
NotAllowed→Gönder→yeni dokunuş, iptalde otomatik indirme olmaması iki motorda sınandı.

## A4 PDF
Saf sayfalama: 12 pt açıklama/14 pt başlık, 10 mm kenar/bindirme, eşitlikte dikey, seyrek hücreleri
atlama; kart/merkez/Bezier içerik kaybı kontrolü. Negatif/uzak/fotoğraflı kartlar, yalnız ip geçen hücre,
son satır/sütun ve 15 rastgele seyrek düzenin kart alanları/eğrileri basılan sayfalarla kapsanıyor.
25.000 hücreyi aşan aşırı geniş tuval kontrollü hata verir; daha küçük ölçeğe düşürülmez.

Chromium ve WebKit gerçek PDF üretir. Örnek 4 sayfa, gömülü JPEG, Türkçe ÇĞİÖŞÜ/ığüşöç ve harita;
>12 onayı, hazır dosyayla Paylaş/Gönder sözleşmesi geçti. PyMuPDF PDF'yi açıp sayfa sayısı/A4 MediaBox,
metin, gömülü font ve 12/14 pt metin boylarını doğruladı; harita/içerik PNG'leri üretildi.
Geist 600 ve Bricolage 700 statik font örnekleri mevcut OFL fontlarından FontTools ile alındı.

## Genel arama, kopya ve çöp
Genel arama tuval adını üstte, kart sonucunu tuval adıyla gösterir; Türkçe harfler sadeleştirilir.
Sonuç doğru tuvali açıp kartı işaretler. Tuval içi arama sınırı korunur.
.sinaps özel uzantısı canShare reddedince indirilir; dosya + kısa metin paylaşım sözleşmesi ayrı sınandı.
Fotoğraflı kopya yeni tuval/kart/ip/foto kimlikleriyle eklenir, kaynak ve bağlantı eşlemesi korunur.
Aynı kaynak tekrar yüklenince Zaten var görülür; yine yeni kopya ve ad sonuna 2/3 eklenir.

Tuval silme onaysız çöp; Geri al, Kurtar ve onaylı Boşalt sınandı. Çöp aramada/paylaşımda yok,
yedekte var; açılışta 31 günlük kaydın kartlarıyla temizlenmesi sınandı. Tam 30 gün sınırı Node testinde.
Kart silme onayı Vazgeç'le veri korur, Sil'le kartı siler ve Geri al göstermez.

## Hata ve çevrimdışı
Depo doluluğu eski kaydı korur, bellekteki yeni yazı yedekle kurtarılır. İki sekmede eski verinin yeni
veri üstüne yazılması durdurulur; bozuk depo ham dosya olarak alınabilir. JSON paylaşım iptali yedek
zamanını değiştirmez. v1/v2→v3 göç eski anahtarı değiştirmez ve yerel metin yeni yüklemeye karşı kazanır.
Gerçek HTTP sunucusu durdurularak yeniden açılışta PWA kodu ve IndexedDB fotoğrafı doğrulandı.

## Cihazda kalanlar
Fiziksel iPhone Safari ve ana ekran PWA: klavye/visualViewport, yerel Dosyalar/AirDrop paylaşımı,
özel .sinaps uzantısının alıcı uygulamalarda taşınması, yoğun fotoğraflı tuvalde bellek ve PDF üretim süresi.
Gerçek A4 baskıda %100 ölçek/cetvelle bindirme kontrolü. WebKit otomasyonu işletim sistemi paylaşım
sayfasına dosya teslimi kanıtı değildir. Native iOS/UTType/UIActivity ve App Store adresi henüz yok.
