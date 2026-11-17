export interface QuestDef {
  id: string;
  title: string;
  /** Bölüm başlığı — görev penceresinde hikaye bölümü olarak gösterilir */
  chapter?: string;
  text: string;
  done: string;
  /** kill: yaratık öldür, stone: lanetli taş kır, upgrade: eşyayı +N yap, collect: eşya topla, talk: NPC ile konuş, level: seviyeye ulaş */
  kind: 'kill' | 'stone' | 'upgrade' | 'collect' | 'talk' | 'level';
  target?: string;
  targetName: string;
  count: number;
  exp: number;
  gold: number;
  items?: { id: string; count: number }[];
}

/**
 * GÖKDEMİR EFSANESİ — ana hikaye.
 * Yıllar önce gökten düşen demir taşlar (Gökdemir) toprakta uyuyordu.
 * Kara Dev Gorvak uyandığında taşlardaki kadim laneti saldı; taşlar her bölgenin
 * en güçlü yaratığını birer koruyucuya dönüştürdü. Bilge Aksakal, kehanetteki
 * savaşçının köye geldiğine inanıyor — oyuncu o savaşçıdır.
 */
export const QUESTS: QuestDef[] = [
  { id: 'q01', chapter: 'I · Köye Varış', title: 'Sürüyü Seyrelt', kind: 'kill', target: 'wolf', targetName: 'Bozkurt', count: 8, exp: 220, gold: 150,
    items: [{ id: 'hp1', count: 5 }],
    text: 'Sonunda geldin, gezgin. Kadim yazıtlar bir savaşçıdan bahsediyordu; umudumuz sensin. Ama önce kendini göster: kuzey çayırlarındaki bozkurtlar lanet yüzünden azdı. Sekizini avla.',
    done: 'Yazıtlar yanılmamış demek. Köylüler bu gece rahat uyuyacak.' },
  { id: 'q02', title: 'Köyün Esnafı', kind: 'talk', target: 'weaponsmith', targetName: 'Silahçı Turan', count: 1, exp: 150, gold: 100,
    text: 'Bu diyarda tek başına yaşanmaz. Git, batı pazardaki Silahçı Turan ile tanış; lanet başlayalı beri köye çelik yetiştiren odur.',
    done: 'Turan seni beğenmiş. Çok konuşur ama malı sağlamdır.' },
  { id: 'q03', title: 'Bataklığın Sürüngenleri', kind: 'kill', target: 'snake', targetName: 'Bataklık Yılanı', count: 8, exp: 480, gold: 220,
    items: [{ id: 'hp1', count: 5 }],
    text: 'Gökdemir taşları düştüğünden beri doğa çıldırdı. Doğudaki göl kıyısında bataklık yılanları kıyıyı sardı; balıkçılarımız aç kalıyor. Sekizini temizle.',
    done: 'Göl kıyısı rahatladı. Lanetin izleri hâlâ oradadır ama.' },
  { id: 'q04', title: 'Kürk Ticareti', kind: 'collect', target: 'pelt', targetName: 'Kurt Postu', count: 6, exp: 600, gold: 320,
    text: 'Kış yaklaşıyor ve lanet yüzünden ticaret yolları kapalı. Kurtlardan altı post topla getir; köy sıcak kalsın.',
    done: 'Bu postlar köyü sıcak tutacak. İşe yarıyorsun, savaşçı.' },
  { id: 'q05', title: 'Sürünün Başı', kind: 'kill', target: 'alpha_wolf', targetName: 'Sürü Lideri', count: 1, exp: 900, gold: 450,
    items: [{ id: 'hp1', count: 5 }],
    text: 'Kurtların liderinin gözleri mor yanıyor — taşların işareti bu! Kuzeydeki inini bul ve Sürü Lideri\'ni indir. Lanetin onu nasıl büyüttüğünü kendi gözünle gör.',
    done: 'Gördün mü? Mor ışık… Taşlar sadece yaratıkları değil, ruhlarını da bozuyor.' },
  { id: 'q06', chapter: 'II · Lanet Uyanır', title: 'İlk Lanetli Taş', kind: 'stone', targetName: 'Lanetli Taş', count: 1, exp: 500, gold: 300,
    items: [{ id: 'crystal', count: 1 }, { id: 'helm1', count: 1 }],
    text: 'Şimdi anlatayım: yıllar önce gökten demir taşlar yağdı — Gökdemir. Uyuyorlardı… ta ki kuzeydeki dağlarda Kara Dev Gorvak uyanana dek. O laneti saldı; taşlar yeniden yanıyor. Git, çayırdaki bir taşı parçala. Ama dikkat et: vurdukça yaratık çağırır.',
    done: 'Taş sustu demek… Bu kristal onun kalbinden. Demirci onunla silahını kutsayabilir — sakla.' },
  { id: 'q07', title: 'Azgın Domuzlar', kind: 'kill', target: 'boar', targetName: 'Yaban Domuzu', count: 10, exp: 1100, gold: 500,
    items: [{ id: 'boots1', count: 1 }],
    text: 'Lanet batıya da sıçradı. Yol kenarındaki tarlaları azgın domuzlar talan ediyor — kışın erzaksız kalırız. On tanesini avla.',
    done: 'Hasat kurtuldu. Köy sana bir borç daha yazdı.' },
  { id: 'q08', title: 'Zehirli Ağlar', kind: 'kill', target: 'spider', targetName: 'Zehirli Örümcek', count: 10, exp: 1400, gold: 650,
    text: 'Güney ormanı zehirli örümceklerle örüldü; oduncular giremiyor. Bunlar da taşın nefesiyle büyüdü. On örümcek öldür.',
    done: 'Ağlar temizlendi. Orman bir nefes aldı.' },
  { id: 'q09', title: 'Baba Kıllı', kind: 'kill', target: 'boar_king', targetName: 'Baba Kıllı', count: 1, exp: 1800, gold: 800,
    items: [{ id: 'boots2', count: 1 }],
    text: 'Domuzların ardında yine taş var: Baba Kıllı\'nın sırtında mor damarlar görenler olmuş. Lanet onu da bir koruyucuya çevirmiş. Batıdaki ini bul ve onu bu zulümden kurtar.',
    done: 'Baba Kıllı huzura kavuştu. Her dev düşüşünde lanetin ağı biraz gevşiyor.' },
  { id: 'q10', title: 'Dağın Efendileri', kind: 'kill', target: 'bear', targetName: 'Dağ Ayısı', count: 6, exp: 2200, gold: 900,
    items: [{ id: 'hp2', count: 5 }],
    text: 'Kuzeybatı ormanındaki ayılar yolcuları parçalıyor. Eskiden insan görünce kaçarlardı — taşlar onları da vahşileştirdi. Altısını indir.',
    done: 'Dağlar senin adını fısıldamaya başladı.' },
  { id: 'q11', title: 'Demircinin Sınavı', kind: 'upgrade', targetName: '+2 eşya', count: 2, exp: 400, gold: 200,
    items: [{ id: 'hp1', count: 5 }, { id: 'mp1', count: 5 }],
    text: 'Önünde büyük savaşlar var; çeliksiz olmaz. Demirci Bora\'ya git, taşın kristalini de yanına al, bir eşyanı +2 yap. Güçlü silah, uzun ömür demektir.',
    done: 'İşte şimdi bir savaşçıya benzedin. Bora senin için dua ediyor.' },
  { id: 'q12', title: 'Vahşi Aygırlar', kind: 'kill', target: 'horse', targetName: 'Yaban Atı', count: 6, exp: 2800, gold: 1100,
    text: 'Doğu çayırlarındaki yaban atları huzursuz — otlakları bitiriyorlar, sürülerimiz aç kalıyor. Üzgünüm ama altısını avlamalısın.',
    done: 'Doğa acımasız; sen de öyle olmalısın bu diyarda.' },
  { id: 'q13', chapter: 'III · Derinlerin Efendileri', title: 'Kobra Kraliçe', kind: 'kill', target: 'serpent_queen', targetName: 'Kobra Kraliçe Naja', count: 1, exp: 3600, gold: 1600,
    items: [{ id: 'neck2', count: 1 }],
    text: 'Şüphem doğrulandı: taşlar her bölgenin efendisini birer koruyucuya çevirdi. Gölün güneyinde Kobra Kraliçe Naja uyandı — zehri artık lanet taşıyor. Onu durdur.',
    done: 'Naja\'nın tılsımı söndü. Ama lanetin efendisi dağlarda gülüyordur hâlâ.' },
  { id: 'q14', title: 'Haydut Yatağı', kind: 'kill', target: 'bandit', targetName: 'Haydut', count: 12, exp: 5200, gold: 2000,
    items: [{ id: 'ring2', count: 1 }],
    text: 'Kötülük sadece yaratıkları değil, insanları da bozdu. Güneydoğu yolunda Karaca\'nın haydutları kamp kurdu; köylüleri soyuyorlar. On ikisini temizle.',
    done: 'Yollar yeniden güvenli. Ama Karaca hâlâ dışarıda…' },
  { id: 'q15', title: 'Madalya Avı', kind: 'collect', target: 'medal', targetName: 'Haydut Madalyası', count: 8, exp: 6500, gold: 2800,
    items: [{ id: 'hp2', count: 5 }],
    text: 'Haydutlar boyunlarında Karaca\'nın madalyalarını taşıyor — söylenti, ona bir Gökdemir parçası sattıkları. Sekiz madalya getir; izi sürelim.',
    done: 'Bu madalyalar… üzerlerinde taşın tozu var. Karaca lanetle iş tutuyor.' },
  { id: 'q15b', title: 'Kendini Kanıtla', kind: 'level', targetName: 'Seviye 15', count: 15, exp: 3000, gold: 1500,
    items: [{ id: 'hp2', count: 5 }, { id: 'mp2', count: 5 }],
    text: 'Bundan sonrası çocuk oyuncağı değil; Koruyucular ve onların efendisi seni bekliyor. Bana hazır olduğunu kanıtla: 15. seviyeye ulaş.',
    done: 'Kehanetin savaşçısı büyüyor. Şimdi gerçek savaş başlıyor.' },
  { id: 'q16', chapter: 'IV · Koruyucular', title: 'Ursak\'ın Pençesi', kind: 'kill', target: 'bear_king', targetName: 'Koca Ursak', count: 1, exp: 7200, gold: 3200,
    items: [{ id: 'armor3', count: 1 }],
    text: 'İlk büyük Koruyucu: Koca Ursak. Taş onu kuzeybatı ormanının kalbine zincirledi; lanetin kuzey kilidini o tutuyor. Onu yık.',
    done: 'Ursak düştüğünde dağlar bile sustu. Lanetin zincirinden bir halka koptu.' },
  { id: 'q17', title: 'Reisin Sonu', kind: 'kill', target: 'bandit_chief', targetName: 'Haydut Reisi Karaca', count: 1, exp: 8000, gold: 3500,
    items: [{ id: 'crystal', count: 3 }],
    text: 'Karaca elindeki taş parçasıyla köyü rehin tutuyor. Lanetle pazarlık edenin sonu bellidir: onu bul ve bu işi bitir. Parçayı da geri al.',
    done: 'Karaca\'nın sancağı düştü ve parçası elimizde. İhanetinin bedelini ödedi.' },
  { id: 'q18', title: 'Gece Sürüsü', kind: 'kill', target: 'nightwolf', targetName: 'Kara Kurt', count: 10, exp: 9500, gold: 3800,
    items: [{ id: 'hp3', count: 5 }],
    text: 'Kuzeydoğunun kara ormanında gece kurtları belirdi — gözleri kömür, dişleri hançer. Koruyucularının öncü sürüsü bunlar. On tanesini indir.',
    done: 'Karanlık sürü dağıldı. Ama orman hâlâ bir şey saklıyor.' },
  { id: 'q19', title: 'Ağ Ana', kind: 'kill', target: 'spider_queen', targetName: 'Ağ Ana Vexa', count: 1, exp: 11500, gold: 4800,
    items: [{ id: 'neck3', count: 1 }],
    text: 'Örümceklerin kaynağı bulundu: Ağ Ana Vexa, güney ormanının derininde lanet ağını örüyor. Onu yok et ki örümcekler bitsin.',
    done: 'Vexa\'nın ağları yırtıldı. Ormanın laneti bir katman inceldi.' },
  { id: 'q20', title: 'Zehirli İğneler', kind: 'kill', target: 'scorpion', targetName: 'Çöl Akrebi', count: 10, exp: 14000, gold: 5200,
    items: [{ id: 'mp3', count: 5 }],
    text: 'Kuzeydoğunun kayalık çölünde dev akrepler kol geziyor — iğnelerinde taşın zehiri var. Kervanlarımız dönemiyor. On akrep kır.',
    done: 'Kervan yolu yeniden açıldı. Çöl senin adını öğrendi.' },
  { id: 'q21', title: 'Kral Aygır', kind: 'kill', target: 'stallion', targetName: 'Kral Aygır Şimşek', count: 1, exp: 17000, gold: 6000,
    items: [{ id: 'helm3', count: 1 }],
    text: 'Doğu çayırlarının efendisi Şimşek, yıldırım kadar hızlı dev bir aygır. Taş onu da koruyucu yaptı; doğu kapısını o tutuyor. Onu alt eden efsane olur.',
    done: 'Şimşek durdu. Rüzgâr artık senin tarafında esiyor.' },
  { id: 'q22', title: 'Taş Muhafızlar', kind: 'kill', target: 'golem', targetName: 'Taş Muhafız', count: 10, exp: 14000, gold: 5000,
    items: [{ id: 'hp2', count: 10 }],
    text: 'Güneybatı harabelerinde lanet bizzat taştan askerler kaldırdı: Taş Muhafızlar. Bunlar Gökdemir\'in ham gücü. On tanesini yık.',
    done: 'Dağ yeniden sessiz. Taş taşı kırıyor artık, savaşçı.' },
  { id: 'q23', title: 'Gece Pençesi', kind: 'kill', target: 'nightclaw', targetName: 'Gece Pençesi', count: 1, exp: 21000, gold: 7500,
    items: [{ id: 'ring3', count: 1 }],
    text: 'Kara kurtların ardında gecenin kendisi yürüyor: Gece Pençesi. Kuzeydoğu ormanındaki Koruyucu o. Onu bul ve yüzleş.',
    done: 'Gece Pençesi bir daha avlanamayacak. Işık biraz daha yaklaştı.' },
  { id: 'q24', chapter: 'V · Lanetin Tahtı', title: 'Kadim Muhafız', kind: 'kill', target: 'golem_king', targetName: 'Kadim Muhafız Rul', count: 1, exp: 26000, gold: 9500,
    items: [{ id: 'crystal', count: 4 }],
    text: 'Harabelerin kalbinde bin yıllık bir bekçi var: Kadim Muhafız Rul. Lanet onu tahtın kapısına dikti. Onu uyandır ve yık — Gorvak\'a giden yol açılsın.',
    done: 'Rul parçalara ayrıldı. Tahtın kapısı artık korumasız.' },
  { id: 'q25', title: 'Akrep İmparatoru', kind: 'kill', target: 'scorpion_king', targetName: 'Akrep İmparatoru Kraz', count: 1, exp: 32000, gold: 12000,
    items: [{ id: 'armor5', count: 1 }],
    text: 'Son Koruyucu ve en ölümcülü: Akrep İmparatoru Kraz. İğnesiyle orduları devirmiş; çölün tahtı onun. Onu yık ki kuzeybatıya giden son engel kalksın.',
    done: 'Kraz\'ın iğnesi kırıldı. Artık yalnızca Gorvak kaldı.' },
  { id: 'q26', chapter: 'VI · Efsane', title: 'Kara Dev Gorvak', kind: 'kill', target: 'ogre', targetName: 'Kara Dev Gorvak', count: 1, exp: 40000, gold: 20000,
    items: [{ id: 'crystal', count: 5 }],
    text: 'Vakit geldi, savaşçı. Bütün lanetin kaynağı kuzeybatının en ucunda bekliyor: Kara Dev Gorvak, Gökdemir\'in efendisi. Yazıtlar bu savaşı yüz yıldır anlatıyor. Git ve diyarı kurtar.',
    done: 'Gorvak düştü, Gökdemir sustu! Efsane artık sensin — köy senin adını şarkılara yazacak.' },
];
