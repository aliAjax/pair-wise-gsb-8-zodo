import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

/* ------------------------------------------------------------------ */
/* 数据层                                                              */
/* ------------------------------------------------------------------ */

const STORE_KEY = 'campaigner:v2';   // 多战役手册
const LEGACY_KEY = 'campaign-log';   // 旧版本：单一战役对象
const PALETTE = ['#d8a153', '#93b7a6', '#b9a6d1', '#c97f6e', '#7fa0c9', '#8fb36f'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().slice(0, 10);

const seed = {
  name: '暮光边境',
  system: 'D&D 5E',
  sessions: [
    { id: 1, date: '2024-06-08', title: '第一章：灰港的钟声', summary: '队伍抵达灰港，在失落的钟楼发现了神秘符文。', tag: '主线', color: '#d8a153' },
    { id: 2, date: '2024-06-15', title: '第二章：雾中来客', summary: '与流浪法师伊琳结盟，追踪海雾中的脚印。', tag: '主线', color: '#93b7a6' },
    { id: 3, date: '2024-06-22', title: '第三章：深林采药', summary: '帮助村民寻找月光草，获得一枚古老铜币。', tag: '支线', color: '#b9a6d1' },
  ],
  characters: [
    { id: 'c1', name: '艾德里安', role: '圣骑士', player: '林默', color: '#d8a153' },
    { id: 'c2', name: '瑟琳', role: '游侠', player: '安然', color: '#93b7a6' },
    { id: 'c3', name: '莫尔', role: '术士', player: '周岳', color: '#b9a6d1' },
  ],
};

// 旧版本单战役 → 战役对象：章节与角色整体迁入；
// 旧章节没有参与者记录，迁入时补入全队，并在章节上标注 legacy。
function normalizeCampaign(raw, legacy) {
  const characters = (raw.characters || []).map((c, i) => ({
    id: c.id || uid(),
    name: c.name || '',
    role: c.role || '',
    player: c.player || '',
    color: c.color || PALETTE[i % PALETTE.length],
  }));
  const sessions = (raw.sessions || []).map((s, i) => ({
    id: s.id || uid(),
    date: s.date || today(),
    title: s.title || '未命名章节',
    summary: s.summary || '',
    tag: s.tag || '主线',
    color: s.color || PALETTE[i % PALETTE.length],
    participants: characters.map((c) => ({ id: c.id, name: c.name })),
    legacy: !!legacy,
  }));
  return {
    id: uid(),
    name: raw.name || '未命名战役',
    system: raw.system || '',
    createdAt: today(),
    legacy: !!legacy,
    characters,
    sessions,
  };
}

function boot() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && Array.isArray(saved.campaigns) && saved.campaigns.length) {
      return {
        state: { campaigns: saved.campaigns, activeId: saved.activeId || saved.campaigns[0].id },
        notice: '',
      };
    }
  } catch { /* 存档损坏时回退到迁移 */ }

  let raw = seed;
  let migrated = false;
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (legacy && (Array.isArray(legacy.sessions) || Array.isArray(legacy.characters))) {
      raw = legacy;
      migrated = true;
    }
  } catch { /* 旧数据损坏，使用内置示例 */ }

  const campaign = normalizeCampaign(raw, migrated);
  return {
    state: { campaigns: [campaign], activeId: campaign.id },
    notice: migrated
      ? `已从旧版本迁入战役「${campaign.name}」：${campaign.sessions.length} 个章节、${campaign.characters.length} 名角色`
      : '',
  };
}

/* ------------------------------------------------------------------ */
/* 组件                                                                */
/* ------------------------------------------------------------------ */

function App() {
  const initial = useMemo(boot, []);
  const [store, setStore] = useState(initial.state);
  const [notice, setNotice] = useState(initial.notice);

  const [tab, setTab] = useState('timeline');
  const [activeSessionId, setActiveSessionId] = useState(null);

  const [showCampaigns, setShowCampaigns] = useState(false);
  const [showChapter, setShowChapter] = useState(false);
  const [showChar, setShowChar] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [charFormOnChapter, setCharFormOnChapter] = useState(false);

  const [chapterForm, setChapterForm] = useState({ title: '', date: today(), summary: '', tag: '主线', participantIds: [] });
  const [chapterError, setChapterError] = useState('');
  const [charForm, setCharForm] = useState({ name: '', role: '', player: '' });
  const [campForm, setCampForm] = useState({ mode: 'create', name: '', system: '' });

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }, [store]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  const campaign = store.campaigns.find((c) => c.id === store.activeId) || store.campaigns[0];
  const sessions = campaign.sessions;
  const characters = campaign.characters;
  const cur = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const patchCampaign = (fn) => {
    setStore((prev) => ({
      ...prev,
      campaigns: prev.campaigns.map((c) => (c.id === prev.activeId ? fn(c) : c)),
    }));
  };

  /* ---------------- 战役切换 / 新建 ---------------- */

  const switchCampaign = (id) => {
    setStore((prev) => ({ ...prev, activeId: id }));
    setActiveSessionId(null);
    setTab('timeline');
    setShowCampaigns(false);
    const target = store.campaigns.find((c) => c.id === id);
    setNotice(`已切换到战役「${target?.name}」`);
  };

  const openCreateCampaign = () => {
    setCampForm({ mode: 'create', name: '', system: '' });
    setShowCampaigns(false);
  };

  const openEditCampaign = () => {
    setCampForm({ mode: 'edit', name: campaign.name, system: campaign.system });
  };

  const saveCampaignMeta = () => {
    if (!campForm.name.trim()) return;
    if (campForm.mode === 'create') {
      const c = {
        id: uid(),
        name: campForm.name.trim(),
        system: campForm.system.trim(),
        createdAt: today(),
        legacy: false,
        characters: [],
        sessions: [],
      };
      setStore((prev) => ({ campaigns: [...prev.campaigns, c], activeId: c.id }));
      setActiveSessionId(null);
      setTab('timeline');
      setNotice(`已创建战役「${c.name}」，先在角色页添加冒险者吧`);
    } else {
      patchCampaign((c) => ({ ...c, name: campForm.name.trim(), system: campForm.system.trim() }));
      setNotice('战役信息已更新');
    }
    setShowCampaigns(false);
  };

  /* ---------------- 章节 ---------------- */

  const openChapterForm = () => {
    setChapterForm({
      title: '',
      date: today(),
      summary: '',
      tag: '主线',
      participantIds: characters.map((c) => c.id), // 默认全选，仍可取消但至少留一人
    });
    setChapterError('');
    setShowChapter(true);
  };

  const toggleParticipant = (id) => {
    setChapterForm((f) => {
      const has = f.participantIds.includes(id);
      const next = has ? f.participantIds.filter((x) => x !== id) : [...f.participantIds, id];
      if (has && next.length === 0) setChapterError('至少选择一名参与者');
      else setChapterError('');
      return { ...f, participantIds: next };
    });
  };

  const addChapter = () => {
    if (!chapterForm.title.trim()) {
      setChapterError('请填写章节标题');
      return;
    }
    if (chapterForm.participantIds.length === 0) {
      setChapterError('请至少勾选一名参与者');
      return;
    }
    const s = {
      id: uid(),
      date: chapterForm.date,
      title: chapterForm.title.trim(),
      summary: chapterForm.summary.trim(),
      tag: chapterForm.tag,
      color: PALETTE[sessions.length % PALETTE.length],
      participants: characters
        .filter((c) => chapterForm.participantIds.includes(c.id))
        .map((c) => ({ id: c.id, name: c.name })),
      legacy: false,
    };
    patchCampaign((c) => ({ ...c, sessions: [...c.sessions, s] }));
    setActiveSessionId(s.id);
    setShowChapter(false);
    setNotice('新章节已加入时间线');
  };

  /* ---------------- 角色 ---------------- */

  const openCharForm = (fromChapter) => {
    setCharForm({ name: '', role: '', player: '' });
    setCharFormOnChapter(!!fromChapter);
    setShowChar(true);
  };

  const addCharacter = () => {
    if (!charForm.name.trim()) return;
    const c = {
      id: uid(),
      name: charForm.name.trim(),
      role: charForm.role.trim() || '冒险者',
      player: charForm.player.trim() || '—',
      color: PALETTE[characters.length % PALETTE.length],
    };
    patchCampaign((camp) => ({ ...camp, characters: [...camp.characters, c] }));
    if (charFormOnChapter) {
      setChapterForm((f) => ({ ...f, participantIds: [...f.participantIds, c.id] }));
      setChapterError('');
    }
    setShowChar(false);
    setNotice(`角色「${c.name}」已加入本战役`);
  };

  const askRemoveCharacter = (c) => {
    const refs = sessions.filter((s) => s.participants?.some((p) => p.id === c.id));
    setRemoveTarget({ character: c, refs, confirmed: false });
  };

  const confirmRemoveCharacter = () => {
    const cid = removeTarget.character.id;
    const name = removeTarget.character.name;
    patchCampaign((camp) => ({
      ...camp,
      characters: camp.characters.filter((c) => c.id !== cid),
      // 参与者快照保留在章节中：正文与姓名仍可见
    }));
    if (chapterForm.participantIds.includes(cid)) {
      setChapterForm((f) => ({ ...f, participantIds: f.participantIds.filter((x) => x !== cid) }));
    }
    setRemoveTarget(null);
    setNotice(`「${name}」已从角色表移除，相关章节中的记录仍保留`);
  };

  /* ---------------- 导出（仅当前战役） ---------------- */

  const exportCampaign = () => {
    const blob = new Blob([JSON.stringify(campaign, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${campaign.name.replace(/[\\/:*?"<>|\s]+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNotice(`已导出战役「${campaign.name}」`);
  };

  /* ---------------- 渲染辅助 ---------------- */

  const chapterIndex = (s) => sessions.findIndex((x) => x.id === s.id) + 1;
  const memberOf = (s, id) => characters.find((c) => c.id === id);

  return (
    <div className="shell">
      <aside>
        <div className="logo"><span>✦</span> CAMPAIGNER</div>

        <button className="campaign" onClick={() => { setCampForm({ mode: 'list' }); setShowCampaigns(true); }}>
          <small>当前战役 · 点击切换</small>
          <strong>{campaign.name}</strong>
          <span>{campaign.system || '未设定规则系统'} · {sessions.length} 章 · {characters.length} 人</span>
          <b className="campaign-switch">⇄ 多战役手册</b>
        </button>

        <nav>
          {[['timeline', '◌', '时间线'], ['characters', '♙', '角色与阵营'], ['places', '⌖', '地点图鉴'], ['loot', '◇', '战利品']].map(
            ([id, icon, label]) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                <i>{icon}</i>{label}
              </button>
            )
          )}
        </nav>

        <div className="side-bottom">
          <button onClick={openEditCampaign}>⚙ 编辑战役信息</button>
          <small>本地存储 · {store.campaigns.length} 个战役</small>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <span className="crumb">{campaign.name} / {campaign.system || '未设定系统'}</span>
            <h1>{tab === 'timeline' ? '战役时间线' : tab === 'characters' ? '角色与阵营' : tab === 'places' ? '地点图鉴' : '战利品'}</h1>
          </div>
          <div className="actions">
            <button onClick={exportCampaign} className="outline">↓ 导出当前战役</button>
            {tab === 'characters'
              ? <button onClick={() => openCharForm(false)} className="primary">＋ 新建角色</button>
              : <button onClick={openChapterForm} className="primary">＋ 新建章节</button>}
          </div>
        </header>

        {/* ---------------- 时间线 ---------------- */}
        {tab === 'timeline' && (
          <div className="timeline-layout">
            <section className="timeline">
              <div className="timeline-intro">
                <div>
                  <span>THE CHRONICLE</span>
                  <h2>记录每一次冒险</h2>
                </div>
                <span className="count">{sessions.length} CHAPTERS</span>
              </div>

              {sessions.length === 0 && (
                <div className="block-empty">
                  <div>◌</div>
                  <h3>这个战役还没有章节</h3>
                  <p>新建章节时可以从本战役的角色表中勾选本章参与者。</p>
                  <button className="primary" onClick={openChapterForm}>＋ 记录第一章</button>
                </div>
              )}

              {sessions.map((s, i) => (
                <button
                  key={s.id}
                  className={'chapter ' + (cur?.id === s.id ? 'selected' : '')}
                  onClick={() => setActiveSessionId(s.id)}
                >
                  <div className="date">
                    <b>{new Date(s.date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</b>
                    <small>{new Date(s.date).getFullYear()}</small>
                  </div>
                  <div className="line">
                    <span style={{ background: s.color }}></span>
                    {i < sessions.length - 1 && <i />}
                  </div>
                  <div className="chapter-copy">
                    <div className="tag">{s.tag}</div>
                    <h3>{s.title}</h3>
                    <p>{s.summary}</p>
                    <div className="cast-line">
                      {(s.participants || []).map((p) => (
                        <span key={p.id} className={memberOf(s, p.id) ? '' : 'gone'} title={memberOf(s, p.id) ? p.name : `${p.name}（已离开角色表）`}>
                          {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="arrow">↗</span>
                </button>
              ))}
            </section>

            <section className="detail-panel">
              {cur ? (
                <>
                  <div className="detail-cover" style={{ background: cur.color }}>
                    <span>CHAPTER {String(chapterIndex(cur)).padStart(2, '0')}</span>
                    <i>✦</i>
                  </div>
                  <div className="detail-body">
                    <span className="tag">{cur.tag}</span>
                    <h2>{cur.title}</h2>
                    <p>{cur.summary || '本章暂无摘要。'}</p>
                    {cur.legacy && (
                      <p className="legacy-note">※ 此章节由旧版本战役记录迁入，参与者按当时全队补录。</p>
                    )}
                    <div className="meta-grid">
                      <div><small>游戏日期</small><strong>{cur.date}</strong></div>
                      <div><small>参与玩家</small><strong>{(cur.participants || []).length} 位</strong></div>
                    </div>
                    <div className="cast-block">
                      <small>本章参与者</small>
                      <div>
                        {(cur.participants || []).map((p) => {
                          const member = memberOf(cur, p.id);
                          return member ? (
                            <span key={p.id} className="chip" style={{ ['--c']: member.color }}>{p.name}</span>
                          ) : (
                            <span key={p.id} className="chip gone" title="已从角色表移除，姓名随章节保留">{p.name} · 已移除</span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="block-empty panel">
                  <div>✦</div>
                  <h3>选择或创建一个章节</h3>
                  <p>章节详情会显示正文与参与者名单。</p>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ---------------- 角色表 ---------------- */}
        {tab === 'characters' && (
          <section className="cards">
            <div className="section-note">
              本战役（{campaign.name}）共有 {characters.length} 位冒险者。移除角色只会从角色表拿掉，章节中的姓名与正文会继续保留。
            </div>
            {characters.length === 0 && (
              <div className="block-empty wide">
                <div>♙</div>
                <h3>角色表还是空的</h3>
                <p>先创建角色，之后新建章节时才能勾选参与者。</p>
                <button className="primary" onClick={() => openCharForm(false)}>＋ 添加第一名角色</button>
              </div>
            )}
            {characters.map((c) => {
              const count = sessions.filter((s) => s.participants?.some((p) => p.id === c.id)).length;              return (
                <article className="char-card" key={c.id}>
                  <div className="avatar" style={{ background: c.color }}>{c.name[0]}</div>
                  <div>
                    <small>{c.role}</small>
                    <h3>{c.name}</h3>
                    <p>玩家 · {c.player} · 出场 {count} 章</p>
                  </div>
                  <button className="remove-btn" title="从角色表移除" onClick={() => askRemoveCharacter(c)}>×</button>
                </article>
              );
            })}
          </section>
        )}

        {/* ---------------- 其余标签（内容随战役隔离，占位） ---------------- */}
        {tab === 'places' && (
          <section className="empty">
            <div>⌖</div>
            <h2>地点图鉴</h2>
            <p>这里只收录「{campaign.name}」的地点，切换战役后展示对应战役的内容。</p>
          </section>
        )}
        {tab === 'loot' && (
          <section className="empty">
            <div>◇</div>
            <h2>战利品清单</h2>
            <p>这里只记录「{campaign.name}」的战利品，导出时也仅包含当前战役。</p>
          </section>
        )}
      </main>

      {/* ---------------- 多战役手册弹窗 ---------------- */}
      {showCampaigns && campForm.mode === 'list' && (
        <div className="modal-bg" onClick={() => setShowCampaigns(false)}>
          <div className="modal wide-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setShowCampaigns(false)}>×</button>
            <span className="crumb">CAMPAIGNS</span>
            <h2>多战役手册</h2>
            <p className="modal-sub">选择一个战役继续主持；每个战役的名称、规则系统、角色表与章节互相独立。</p>
            <div className="camp-list">
              {store.campaigns.map((c) => (
                <button key={c.id} className={'camp-item' + (c.id === campaign.id ? ' current' : '')} onClick={() => switchCampaign(c.id)}>
                  <span className="dot" style={{ background: c.legacy ? '#93b7a6' : '#d8a153' }} />
                  <div className="grow">
                    <strong>{c.name}</strong>
                    <small>{c.system || '未设定规则系统'} · {c.sessions.length} 章 · {c.characters.length} 人{c.legacy ? ' · 旧版迁入' : ''}</small>
                  </div>
                  {c.id === campaign.id && <b className="on">进行中</b>}
                  <b className="go">切换 →</b>
                </button>
              ))}
            </div>
            <button className="primary full" onClick={openCreateCampaign}>＋ 新建战役</button>
          </div>
        </div>
      )}

      {/* 新建 / 编辑战役 */}
      {(campForm.mode === 'create' || campForm.mode === 'edit') && (
        <div className="modal-bg">
          <div className="modal">
            <button className="close" onClick={() => campForm.mode === 'edit' ? setShowCampaigns(false) : setCampForm({ mode: 'list' })}>×</button>
            <span className="crumb">CAMPAIGN</span>
            <h2>{campForm.mode === 'create' ? '开一个新战役' : '编辑战役信息'}</h2>
            <label>战役名称
              <input value={campForm.name} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} placeholder="例：深渊回响" />
            </label>
            <label>规则系统
              <input value={campForm.system} onChange={(e) => setCampForm({ ...campForm, system: e.target.value })} placeholder="例：D&D 5E / 克苏鲁的呼唤 7E / 自定义" />
            </label>
            <button className="primary full" onClick={saveCampaignMeta}>{campForm.mode === 'create' ? '创建并进入' : '保存'}</button>
            {campForm.mode === 'create' && (
              <button className="link-btn" onClick={() => setCampForm({ mode: 'list' })}>← 返回战役列表</button>
            )}
          </div>
        </div>
      )}

      {/* ---------------- 新建章节 ---------------- */}
      {showChapter && (
        <div className="modal-bg">
          <div className="modal">
            <button className="close" onClick={() => setShowChapter(false)}>×</button>
            <span className="crumb">NEW CHAPTER · {campaign.name}</span>
            <h2>记录新的章节</h2>
            <label>章节标题
              <input value={chapterForm.title} onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })} placeholder="例：第三章：月下集市" />
            </label>
            <label>游戏日期
              <input type="date" value={chapterForm.date} onChange={(e) => setChapterForm({ ...chapterForm, date: e.target.value })} />
            </label>
            <label>章节摘要
              <textarea rows="3" value={chapterForm.summary} onChange={(e) => setChapterForm({ ...chapterForm, summary: e.target.value })} placeholder="发生了什么？" />
            </label>
            <label>章节类型
              <select value={chapterForm.tag} onChange={(e) => setChapterForm({ ...chapterForm, tag: e.target.value })}>
                <option>主线</option><option>支线</option><option>番外</option>
              </select>
            </label>
            <div className="picker">
              <div className="picker-head">
                <small>本章参与者（从本战役角色勾选，至少 {chapterForm.participantIds.length === 0 ? '选择' : `已选 ${chapterForm.participantIds.length}`} 人）</small>
                <button type="button" onClick={() => openCharForm(true)}>＋ 新角色</button>
              </div>
              {characters.length === 0 ? (
                <p className="picker-empty">本战役还没有角色，请先<span onClick={() => openCharForm(true)}>创建角色</span>。</p>
              ) : (
                <div className="picker-grid">
                  {characters.map((c) => (
                    <label key={c.id} className={'pick' + (chapterForm.participantIds.includes(c.id) ? ' on' : '')}>
                      <input type="checkbox" checked={chapterForm.participantIds.includes(c.id)} onChange={() => toggleParticipant(c.id)} />
                      <span className="avatar sm" style={{ background: c.color }}>{c.name[0]}</span>
                      <span className="grow"><b>{c.name}</b><small>{c.role} · {c.player}</small></span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {chapterError && <div className="form-error">{chapterError}</div>}
            <button className="primary full" onClick={addChapter}>保存章节</button>
          </div>
        </div>
      )}

      {/* ---------------- 新建角色 ---------------- */}
      {showChar && (
        <div className="modal-bg">
          <div className="modal">
            <button className="close" onClick={() => setShowChar(false)}>×</button>
            <span className="crumb">NEW CHARACTER · {campaign.name}</span>
            <h2>{charFormOnChapter ? '为本战役添加角色' : '加入新角色'}</h2>
            <label>角色名
              <input value={charForm.name} onChange={(e) => setCharForm({ ...charForm, name: e.target.value })} placeholder="例：凯尔" />
            </label>
            <label>职业 / 身份
              <input value={charForm.role} onChange={(e) => setCharForm({ ...charForm, role: e.target.value })} placeholder="例：游荡者" />
            </label>
            <label>玩家
              <input value={charForm.player} onChange={(e) => setCharForm({ ...charForm, player: e.target.value })} placeholder="玩家昵称" />
            </label>
            <button className="primary full" onClick={addCharacter} disabled={!charForm.name.trim()}>
              {charFormOnChapter ? '创建并勾选为参与者' : '加入角色表'}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- 移除角色确认 ---------------- */}
      {removeTarget && (
        <div className="modal-bg">
          <div className="modal">
            <button className="close" onClick={() => setRemoveTarget(null)}>×</button>
            <span className="crumb">REMOVE CHARACTER</span>
            <h2>从角色表移除「{removeTarget.character.name}」？</h2>
            <p className="modal-sub">
              该角色仍出现在以下 {removeTarget.refs.length} 个章节中。确认后只会从角色表移除，
              章节正文与参与者姓名将原样保留，并标注为「已移除」。
            </p>
            {removeTarget.refs.length > 0 ? (
              <ul className="ref-list">
                {removeTarget.refs.map((s) => (
                  <li key={s.id}>
                    <span className="tag">{s.tag}</span>
                    <b>{s.title}</b>
                    <small>{s.date}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="modal-sub dim">没有章节引用该角色，可安全移除。</p>
            )}
            <div className="confirm-row">
              <button className="outline" onClick={() => setRemoveTarget(null)}>取消</button>
              <button className="danger" onClick={confirmRemoveCharacter}>确认移除（保留章节记录）</button>
            </div>
          </div>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
