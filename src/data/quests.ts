export interface QuestDef {
  id: string;
  title: string;
  text: string;
  done: string;
  /** kill: belirli yaratığı öldür, stone: lanetli taş kır, upgrade: bir eşyayı +N yap */
  kind: 'kill' | 'stone' | 'upgrade';
  target?: string;
  targetName: string;
  count: number;
  exp: number;
  gold: number;
  items?: { id: string; count: number }[];
}

export const QUESTS: QuestDef[] = [
  { id: 'q1', title: 'Sürüyü Seyrelt', kind: 'kill', target: 'wolf', targetName: 'Bozkurt', count: 8, exp: 220, gold: 150,
    items: [{ id: 'hp1', count: 5 }],
    text: 'Hoş geldin evlat. Kuzey çayırlarındaki bozkurtlar sürülerimize dadandı. Kuzey kapısından çık, yolu izle ve sekiz bozkurt avla. (Haritada kuzey yukarıdadır.)',
    done: 'Eline sağlık. Köylüler bu gece rahat uyuyacak.' },
  { id: 'q2', title: 'İlk Lanetli Taş', kind: 'stone', targetName: 'Lanetli Taş', count: 1, exp: 500, gold: 300,
    items: [{ id: 'crystal', count: 1 }, { id: 'helm1', count: 1 }],
    text: 'Gökten düşen mor taşlar hayvanları azdırıyor. Çayırlarda parlayan bir Lanetli Taş bul ve parçala. Dikkat et; taş, vurdukça yaratık çağırır.',
    done: 'Taş sustu demek… Bu kristali sakla, demirci onunla silahını güçlendirebilir.' },
  { id: 'q3', title: 'Demircinin Sınavı', kind: 'upgrade', targetName: '+2 eşya', count: 2, exp: 400, gold: 200,
    items: [{ id: 'hp1', count: 5 }, { id: 'mp1', count: 5 }],
    text: 'Demirci Bora ile konuş ve bir eşyanı en az +2 seviyesine yükselt. Güçlü silah, uzun ömür demektir.',
    done: 'İşte şimdi bir savaşçıya benzedin.' },
  { id: 'q4', title: 'Azgın Domuzlar', kind: 'kill', target: 'boar', targetName: 'Yaban Domuzu', count: 10, exp: 1100, gold: 500,
    items: [{ id: 'boots1', count: 1 }],
    text: 'Batı yolundaki tarlaları yaban domuzları talan ediyor. On tanesini avla.',
    done: 'Hasat kurtuldu. Köy sana minnettar.' },
  { id: 'q5', title: 'Dağın Efendileri', kind: 'kill', target: 'bear', targetName: 'Dağ Ayısı', count: 6, exp: 2200, gold: 900,
    items: [{ id: 'hp2', count: 5 }],
    text: 'Kuzeybatı ormanındaki dağ ayıları yolcuları parçalıyor. Altısını indir.',
    done: 'Cesaretin dillere destan olacak.' },
  { id: 'q6', title: 'Haydut Yatağı', kind: 'kill', target: 'bandit', targetName: 'Haydut', count: 12, exp: 5200, gold: 2000,
    items: [{ id: 'ring2', count: 1 }],
    text: 'Güneydoğu yolunun sonunda haydutlar kamp kurdu. On ikisini temizle.',
    done: 'Yollar yeniden güvenli.' },
  { id: 'q7', title: 'Reisin Sonu', kind: 'kill', target: 'bandit_chief', targetName: 'Haydut Reisi Karaca', count: 1, exp: 8000, gold: 3500,
    items: [{ id: 'crystal', count: 3 }],
    text: 'Haydutların başı Karaca hâlâ hayatta. Onu bul ve bu işi bitir.',
    done: 'Karaca\'nın sancağı düştü!' },
  { id: 'q8', title: 'Taş Muhafızlar', kind: 'kill', target: 'golem', targetName: 'Taş Muhafız', count: 10, exp: 14000, gold: 5000,
    items: [{ id: 'hp2', count: 10 }],
    text: 'Güneybatı dağlarında kadim taş muhafızlar uyandı. On tanesini yık.',
    done: 'Dağ yeniden sessiz.' },
  { id: 'q9', title: 'Kara Dev Gorvak', kind: 'kill', target: 'ogre', targetName: 'Kara Dev Gorvak', count: 1, exp: 40000, gold: 20000,
    items: [{ id: 'crystal', count: 5 }],
    text: 'Bütün lanetin kaynağı kuzeybatının en ucundaki Kara Dev Gorvak. Hazır olduğunda onunla yüzleş.',
    done: 'Efsane artık sensin, Gökdemir\'in kahramanı!' },
];
