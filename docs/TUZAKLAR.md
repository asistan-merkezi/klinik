# Bilinen Tuzaklar — Klinik Asistanı

Hepsi bu projede gerçekten yaşandı; bir kısmı birden çok kez. CLAUDE.md'de bu
maddelerin tek satırlık başlıkları var — buradaki açıklamalar "neden" kısmıdır.
İlgili alana dokunmadan önce bu dosyayı aç.

**Supabase / RLS**
- RLS'te **INSERT/SELECT/UPDATE/DELETE dörtlüsü tek tek** kontrol edilir. "SELECT var" sanmak, portal güncellemelerinin hatasız ve 0 satırla sessizce engellenmesine yol açtı.
- `.insert().select()` (RETURNING) **SELECT policy'sine de tabidir** — anon akışında `WITH CHECK` doğru olsa bile "violates RLS" alırsın. Çözüm: RETURNING'e hiç ihtiyaç duymamak, id'yi sunucuda `crypto.randomUUID()` ile üretmek.
- Policy içindeki `EXISTS` alt sorgusu da **çağıran rolün RLS'ine tabidir**; anon'un ana tabloda SELECT policy'si yoksa hep false döner → `SECURITY DEFINER` helper ile bypass (`hasta_qr_self_servis_mi` deseni).
- **PostgREST view embed**: VIEW'lar FK metadata taşımaz, `.select("...hasta(ad)")` SESSİZCE boş döner. View sorgusunda embed DENEME, ayrı çekip `Map`'le birleştir. 1:1 ters-FK embed'lerinde de dizi/obje belirsizliği var.
- pgcrypto bu DB'de `public` değil **`extensions` şemasında** → yeni RPC'de `SET search_path = public, extensions`, yoksa `crypt()`/`pgp_sym_encrypt()` "function does not exist" verir. (`personel_hassas_kaydet`'te aynı hata UYKUDA.)
- Pooler: host `.co` değil **`.com`** (`aws-0-eu-central-1.pooler.supabase.com`), **port 5432** (session mode; 6543 "prepared statement already exists" verir). `supabase db push --db-url` buradan çalışır.
- `@supabase/ssr` browser client'ı realtime'a JWT geçirmez → RLS'li `postgres_changes` için `supabase.realtime.setAuth(token)` elle çağrılmalı; yoksa "SUBSCRIBED" görünür ama hiç event gelmez.
- `is_super_admin()` service-role bağlantısında `auth.uid()` NULL olduğundan false döner → ayrıca `auth.role()='service_role'` kontrolü gerekir.

**Next.js / React**
- `revalidatePath` ile bir hub rotasını onun **ALT rotasından** revalidate etmek `useActionState`'in `isPending`'ini sonsuza kadar takılı bırakıyor (veri yazılır, 200 döner, client sinyal almaz). Aynı rota / kardeş rotalar / üst→alt güvenli; **sadece alt→üst tehlikeli.** — **2026-09-13 (Next.js 16.2.12, production build) Playwright ile gerçek reprodüksiyon denendi, ÜRETİLEMEDİ**: `revalidateHastaDetay()` (`app/(app)/panel/hastalar/[id]/revalidate.ts`) tam da bu deseni uyguluyor (hub `/panel/hastalar/[id]` + 4 alt rota birden revalidate) ve `/kisisel` alt rotasındaki `temelBilgileriGuncelle` formu (`useActionState`, `detayli-bilgiler-karti.tsx:233`) bunu çağırıyor; formu kaydedince `isPending` ~250-320ms içinde kapandı, hiç takılmadı. Randevu check-in'de de (`randevuGelisIsaretle`, aynı `revalidateHastaDetay` çağrısı, `useTransition` tabanlı) 1-2 saniyede kapandı. Bu önkoşulla (Next 16.2.12) sorun artık gözlemlenmiyor — muhtemelen daha eski bir Next.js sürümünün davranışıydı ve framework güncellemesiyle giderilmiş olabilir. **Sonuç: madde geçmiş bir riski belgeliyor, güncel sürümde doğrulanmış bir tekrar yok** — yeni bir hub/alt-rota revalidate deseni eklerken yine dikkatli ol ama "otomatik olarak bozuk" varsayma, gerçek build'de test et.
- SVG'de dinamik map'lenen elementin ÇOCUĞU olarak `<title>` koyma → hydration mismatch. Erişilebilirlik için `aria-label` attribute'u.
- `react-hooks/set-state-in-effect` aktif: ham `useEffect`+`setState` yerine `useQuery` veya üç adımlı öneri/override `useMemo` deseni.
- Base UI `Select` programatik değerde `items` prop'u yoksa ham UUID gösterir → `items={liste.map(x=>({value:x.id,label:x.ad}))}` şart. Çok büyük listelerde (81 il/binlerce mahalle) native `<select>` tercih edildi.
- `react-dom/server` (`renderToStaticMarkup`) route handler'ların da dahil olduğu server modül grafiğinde Turbopack'çe reddediliyor ("react-server" çakışması) — PDF şablonları bu yüzden düz string üretir.

**CSS / Tailwind**
- `Button variant="outline"` üstüne renk bindirirken `!bg-*`/`!border-*`/`!text-*` kullan; `!`siz override derlenmiş CSS sırası yüzünden sessizce kaybolur. Sonra GERÇEKTEN `next build` alıp `.next/static/chunks/*.css`'te `!important`i doğrula (3 kez yaşandı, her seferinde "ekranda mantıklı görünüyor" yanılttı).
- Sabit yükseklik + `items-center` + `overflow-y-auto` üçlüsü: taşan içeriğin yarısı konteynerin ÜSTÜNE taşar, `scrollHeight` saymaz, scroll ile ulaşılamaz. Önce `items-start` dene.
- Responsive eklerken `lg:` önekini unutma; öneksiz `h-[320px]`/`overflow-y-auto` mobil davranışı da bozar.

**PDF üretimi** (en pahalı öğrenilen alan)
- `puppeteer-core` ve `@sparticuz/chromium` **aynı Chrome milestone'unda** olmalı ve `--save-exact` ile SABİT yazılmalı (caret range bir sonraki `npm install`'da sessizce bozar). Doğrulama: `npm pack` + `revisions.js` karşılaştırması. Şu an: `puppeteer-core@25.1.0` + `@sparticuz/chromium@149.0.0`.
- **Yeni PDF route'u eklerken `next.config.ts` → `outputFileTracingIncludes` ve `vercel.json` → `functions` bloğuna EKLEMEYİ UNUTMA.** `@sparticuz/chromium` binary yolunu `import.meta.url` ile runtime'da hesaplar, `@vercel/nft` statik analizle takip edemez, `bin/*.br` bundle'dan sessizce düşer, prod'da ENOENT/"Could not find Chromium". Doğrulama: build sonrası `.next/server/app/api/.../route.js.nft.json` içinde 4/4 `.br` var mı?
- `maxDuration:60` + `memory:1769` (67MB brotli decompress + Chromium açılışı). Memory yalnız `vercel.json`'dan verilir, route segment config'ten değil.
- `chromium.headless` getter'ı yok → serverless dalda `headless:"shell"` (`chromium.args` zaten `--headless='shell'` içerir).
- Lambda'da **sistem fontu yok** → Inter latin+latin-ext base64 `@font-face` ile gömülü, yoksa Türkçe karakterler kutu çıkar. **Emoji fontu da yok** → ⚠/🩸 boş kutu; lucide-react path'iyle inline SVG'ye çevrildi.
- `page.goto()` DEĞİL `page.setContent()` (form auth arkasında; çerez taşıma derdi + login ekranını basma riski). setContent göreli yolları kırdığı için şablon kendi kendine yeter, dinamik metin `kacir()` ile elle escape edilir.
- Sayfa kırılımı CSS'te (`break-after:page`/`break-inside:avoid`), sabit px genişlik YOK — A4'ü `page.pdf({format:'A4'})` belirler. Chromium'un print layout motoruna güven, doğal taşımaya bırak.

**Süreç**
- Yerel Chromium ile doğrulamak `@sparticuz/chromium` kod yolunu HİÇ egzersiz etmez. Genel kural: "ekranda mantıklı görünüyor" ≠ doğrulandı. Bu projede işe yarayan yöntem: gerçek psql oturum simülasyonu (`BEGIN` + `SET LOCAL role authenticated` + `set_config('request.jwt.claims',...)` + ROLLBACK) ve geçici test klinik + Playwright ile gerçek giriş.
- `npm run lint` baseline'ı sabit değil (7/9/11 arasında gezindi, hepsi ilgisiz eski dosyalarda). Sabit sayıya referans verme, o anki değeri ölç.

## Teknik Borç: Sidebar rol görünürlüğü
`sidebar.tsx`'teki `TERAPISTE_GORUNMEYEN_GRUPLAR` ile sayfa taraflı `rol IN (...)` kontrolleri **senkron tutulmuyor**. Sayfaya yeni kısıt eklenip sidebar güncellenmezse link görünüp tıklayınca redirect yiyen eski soruna dönülür. Kalıcı çözüm: merkezi route→izinli-rol eşlemesi.
