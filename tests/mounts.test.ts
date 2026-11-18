import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { HORSES } from '../src/data/horses';
import { Player } from '../src/entities/player';
import { GALLOP_DRAIN, MOUNT_COOLDOWN, SUMMON_TIME } from '../src/systems/mounts';

/** Oyuncuyu gerçek dünya olmadan kurar; ses, efekt ve parçacıklar no-op. */
function makeGame() {
  const events = new EventBus();
  const logs: string[] = [];
  events.on('log', (p: { msg: string }) => logs.push(p.msg));
  const noop = () => undefined;
  const stub = () => new Proxy({}, { get: () => noop });
  const game: any = {
    events, logs, time: 0,
    terrain: { getHeight: () => 0, walkable: () => true, getDirt: () => 0 },
    colliders: { resolve: noop },
    scene: { add: noop, remove: noop },
    audio: stub(), effects: stub(), particles: stub(),
    camera: { setView: noop, snap: noop, addShake: noop },
    combat: { nearestEnemy: () => null },
    tex: {}, input: {},
  };
  return game;
}

/** Çağırmayı bitirecek kadar zaman ilerletir. */
const finishSummon = (p: Player) => { for (let t = 0; t <= SUMMON_TIME + 0.05; t += 0.05) p.mounts.tick(0.05); };
/** Biniş/iniş beklemesini geçirir. */
const passCooldown = (p: Player) => p.mounts.tick(MOUNT_COOLDOWN + 0.01);

describe('binek sistemi', () => {
  it('atı olmayan oyuncu binemez ve uyarı alır', () => {
    const g = makeGame();
    const p = new Player(g, 'Test', 'warrior');
    p.toggleMount();
    expect(p.mounts.state).toBe('foot');
    expect(g.logs.some((m: string) => m.includes('Seyis'))).toBe(true);
  });

  it('satın alma akçe düşer, atı sahiplenir ve aktif yapar', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.gold = 10_000;
    expect(p.mounts.buy('tazi')).toBe(true);
    expect(p.gold).toBe(10_000 - HORSES.tazi.cost);
    expect(p.mounts.owns('tazi')).toBe(true);
    expect(p.mounts.active).toBe('tazi');
  });

  it('seviyesi yetmeyen at satın alınamaz', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.gold = 1_000_000;
    expect(p.mounts.buy('simsek')).toBe(false);
    expect(p.mounts.owns('simsek')).toBe(false);
  });

  it('akçesi yetmeyen at satın alınamaz', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.gold = 10;
    expect(p.mounts.buy('tazi')).toBe(false);
  });

  it('çağırma süre sonunda bindirir ve hızı artırır', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.gold = 10_000;
    p.mounts.buy('tazi');
    const footSpeed = p.moveSpeed;
    p.toggleMount();
    expect(p.mounts.state).toBe('summoning');
    finishSummon(p);
    expect(p.mounted).toBe(true);
    expect(p.moveSpeed).toBeCloseTo(footSpeed * HORSES.tazi.speed);
  });

  it('hasar çağırmayı böler', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.gold = 10_000;
    p.mounts.buy('tazi');
    p.toggleMount();
    p.takeDamage(5);
    expect(p.mounts.state).toBe('foot');
  });

  it('binekteyken R ile iner ve hız eski haline döner', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.gold = 10_000;
    p.mounts.buy('tazi');
    const footSpeed = p.moveSpeed;
    p.toggleMount();
    finishSummon(p);
    passCooldown(p);
    p.toggleMount();
    expect(p.mounted).toBe(false);
    expect(p.moveSpeed).toBeCloseTo(footSpeed);
  });

  it('dörtnala dayanıklılığı harcar, sıfırda at yorulur ve dinlenince toparlar', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.gold = 10_000;
    p.mounts.buy('tazi');
    p.toggleMount();
    finishSummon(p);
    const m = p.mounts;
    expect(m.wantsGallop(true, true)).toBe(true);
    m.updateStamina(1, true);
    expect(m.stamina).toBeCloseTo(HORSES.tazi.stamina - GALLOP_DRAIN);
    m.updateStamina(100, true);
    expect(m.tired).toBe(true);
    expect(m.wantsGallop(true, true)).toBe(false);
    for (let i = 0; i < 200; i++) m.updateStamina(0.1, false);
    expect(m.tired).toBe(false);
    expect(m.stamina).toBeLessThanOrEqual(m.maxStamina);
  });

  it('aktif at değişince binekten iner ve dayanıklılık yeni ata göre dolar', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.level = 12;
    p.gold = 100_000;
    p.mounts.buy('tazi');
    p.mounts.buy('bozkir');
    p.mounts.select('tazi');
    p.toggleMount();
    finishSummon(p);
    p.mounts.select('bozkir');
    expect(p.mounted).toBe(false);
    expect(p.mounts.active).toBe('bozkir');
    expect(p.mounts.stamina).toBe(HORSES.bozkir.stamina);
  });

  it('kayıt sahip olunan atları ve aktif atı korur', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.level = 12;
    p.gold = 100_000;
    p.mounts.buy('tazi');
    p.mounts.buy('bozkir');
    const copy = new Player(makeGame(), 'Test', 'warrior', p.serialize());
    expect(copy.mounts.owned).toEqual(['tazi', 'bozkir']);
    expect(copy.mounts.active).toBe('bozkir');
  });

  it('eski tek at kaydı binek listesine taşınır', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    const save = { ...p.serialize(), mounts: undefined, horse: 'savas' };
    const copy = new Player(makeGame(), 'Test', 'warrior', save);
    expect(copy.mounts.owned).toEqual(['savas']);
    expect(copy.mounts.active).toBe('savas');
  });
});
