# Özet
PDF üretimi için sabit, yerel tarayıcı dosyaları. CDN veya sunucuya veri gönderimi yok.
pdf-lib 1.17.1 ve @pdf-lib/fontkit 1.1.1; yalnız PDF açılınca çalıştırılır, PWA önbelleğinde bulunur.
Gerekçe: Unicode font alt kümesi, JPEG kaynakları ve vektör PDF kırpmasını elle yeniden yazmamak.

Kaynaklar npm paketlerinin `dist/` dosyalarıdır:
- [pdf-lib 1.17.1](https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz), MIT: pdf-lib-LICENSE.md.
- [fontkit 1.1.1](https://registry.npmjs.org/@pdf-lib/fontkit/-/fontkit-1.1.1.tgz), MIT;
  [fork](https://github.com/Hopding/fontkit), [upstream lisans](https://github.com/foliojs/fontkit/blob/master/LICENSE): fontkit-LICENSE.md.

Fontlar `../fonts/` içinde; OFL lisansları orada. FontTools yalnız mevcut değişken fontun 600/700
örneklerini oluşturmak için kullanıldı; uygulama çalışma zamanı bağımlılığı değildir.
