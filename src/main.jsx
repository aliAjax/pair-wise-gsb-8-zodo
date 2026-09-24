import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

const V1_KEY = 'campaign-log';      // 旧版单战役存储键
const V2_KEY = 'campaign-log-v2';   // 新版多战役存储键
const PALETTE = ['#d8a153', '#93b7a6', '#b9a6d1', '#7fa8c9', '#d18a8a', '#a8bd7f'];
const today = new Date().toISOString().slice(0, 10);
let seq = 0;
const uid = p => `${p}-${Date.now().toString(36)}-${seq++}`;

const seed = {
  activeId: 'cmp-muguang',
  campaigns: [
    {
      id: 'cmp-muguang',
      name: '暮光边境',
      system: 'D&D 5E',
      characters: [
        {id: 'c-adrian', name: '艾德里安', role: '圣骑士', player: '林默', color: '#d8a153'},
        {id: 'c-selin', name: '瑟琳', role: '游侠', player: '安然', color: '#93b7a6'},
        {id: 'c-moer', name: '莫尔', role: '术士', player: '周岳', color: '#b9a6d1'},
      ],
      sessions: [
        {id: 's-m1', date: '2024-06-08', title: '第一章：灰港的钟声', summary: '队伍抵达灰港，在失落的钟楼发现了神秘符文。', tag: '主线', color: '#d8a153', participants: ['艾德里安', '瑟琳', '莫尔']},
        {id: 's-m2', date: '2024-06-15', title: '第二章：雾中来客', summary: '与流浪法师伊琳结盟，追踪海雾中的脚印。', tag: '主线', color: '#93b7a6', participants: ['瑟琳', '莫尔']},
        {id: 's-m3', date: '2024-06-22', title: '支线：深林采药', summary: '帮助村民寻找月光草，获得一枚古老铜币。', tag: '支线', color: '#b9a6d1', participants: ['艾德里安', '瑟琳']},
      ],
    },
    {
      id: 'cmp-wudu',
      name: '雾都谜影',
      system: '克苏鲁的呼唤 7版',
      characters: [
        {id: 'c-shenyan', name: '沈砚', role: '私家侦探', player: '苏黎', color: '#7fa8c9'},
        {id: 'c-guqiu', name: '顾秋', role: '报社记者', player: '陈默', color: '#d18a8a'},
      ],
      sessions: [
        {id: 's-w1', date: '2024-07-06', title: '第一章：雨夜委托', summary: '一封没有署名的信，把调查员引向码头区的旧仓库。', tag: '主线', color: '#7fa8c9', participants: ['沈砚', '顾秋']},
      ],
    },
  ],
};

// 旧版存档 → 多战役结构：角色补 id；旧版每章按"全员参与"展示，迁移时把角色姓名快照进 participants
function migrateV1(old) {
  const characters = (old.characters || []).map((c, i) => ({
    id: uid('c'),
    name: c.name,
    role: c.role,
    player: c.player,
    color: c.color || PALETTE[i % PALETTE.length],
  }));
  return {
    id: uid('cmp'),
    name: old.name || '未命名战役',
    system: old.system || '未指定规则',
    characters,
    sessions: (old.sessions || []).map(s => ({...s, participants: characters.map(c => c.name)})),
  };
}

function load() {
  try {
    const v2 = JSON.parse(localStorage.getItem(V2_KEY));
    if (v2 && Array.isArray(v2.campaigns) && v2.campaigns.length) return v2;
  } catch {}
  try {
    const old = JSON.parse(localStorage.getItem(V1_KEY));
    if (old && old.name) {
      const migrated = migrateV1(old);
      return {activeId: migrated.id, campaigns: [migrated]};
    }
  } catch {}
  return seed;
}

const emptyChapterForm = () => ({title: '', date: today, summary: '', tag: '主线', participants: []});

function App() {
  const [store, setStore] = useState(load);
  const [tab, setTab] = useState('timeline');
  const [activeSession, setActiveSession] = useState(null);
  const [modal, setModal] = useState(null); // 'chapter' | 'switcher' | 'campaign' | 'character'
  const [removing, setRemoving] = useState(null); // 待确认移除的角色
  const [notice, setNotice] = useState('');
  const [formErr, setFormErr] = useState('');
  const [form, setForm] = useState(emptyChapterForm);
  const [campForm, setCampForm] = useState({name: '', system: ''});
  const [charForm, setCharForm] = useState({name: '', role: '', player: ''});

  useEffect(() => localStorage.setItem(V2_KEY, JSON.stringify(store)), [store]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const campaign = store.campaigns.find(c => c.id === store.activeId) || store.campaigns[0];
  const cur = campaign.sessions.find(s => s.id === activeSession) || campaign.sessions[0];
  const chapterNo = cur ? campaign.sessions.findIndex(s => s.id === cur.id) + 1 : 0;

  const updateCampaign = fn => setStore(s => ({
    ...s,
    campaigns: s.campaigns.map(c => (c.id === campaign.id ? fn(c) : c)),
  }));

  const switchCampaign = id => {
    setStore(s => ({...s, activeId: id}));
    setActiveSession(null);
    setModal(null);
    setNotice('已切换战役，仅显示当前战役内容');
  };

  const addCampaign = () => {
    if (!campForm.name.trim()) return;
    const c = {id: uid('cmp'), name: campForm.name.trim(), system: campForm.system.trim() || '未指定规则', characters: [], sessions: []};
    setStore(s => ({...s, campaigns: [...s.campaigns, c], activeId: c.id}));
    setActiveSession(null);
    setCampForm({name: '', system: ''});
    setModal(null);
    setNotice(`已创建并切换到「${c.name}」`);
  };

  const toggleParticipant = name => setForm(f => ({
    ...f,
    participants: f.participants.includes(name)
      ? f.participants.filter(n => n !== name)
      : [...f.participants, name],
  }));

  const addChapter = () => {
    if (!form.title.trim()) { setFormErr('请填写章节标题'); return; }
    if (form.participants.length < 1) { setFormErr('请至少选择一位参与者'); return; }
    const s = {...form, title: form.title.trim(), id: uid('s'), color: PALETTE[campaign.sessions.length % PALETTE.length]};
    updateCampaign(c => ({...c, sessions: [...c.sessions, s]}));
    setActiveSession(s.id);
    setForm(emptyChapterForm());
    setFormErr('');
    setModal(null);
    setNotice('新章节已加入时间线');
  };

  const addCharacter = () => {
    if (!charForm.name.trim()) return;
    const ch = {
      id: uid('c'),
      name: charForm.name.trim(),
      role: charForm.role.trim() || '冒险者',
      player: charForm.player.trim() || '—',
      color: PALETTE[campaign.characters.length % PALETTE.length],
    };
    updateCampaign(c => ({...c, characters: [...c.characters, ch]}));
    setCharForm({name: '', role: '', player: ''});
    setModal(null);
    setNotice(`已加入角色 ${ch.name}`);
  };

  // 参与者按姓名快照存进章节，所以移除角色只影响角色表，章节记录不动
  const refsOf = name => campaign.sessions.filter(s => (s.participants || []).includes(name));
  const removingRefs = removing ? refsOf(removing.name) : [];

  const confirmRemove = () => {
    updateCampaign(c => ({...c, characters: c.characters.filter(x => x.id !== removing.id)}));
    setNotice(`已从角色表移除 ${removing.name}，相关章节记录保留`);
    setRemoving(null);
  };

  const exportData = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(campaign, null, 2)], {type: 'application/json'}));
    a.download = `${campaign.name}.json`;
    a.click();
    setNotice('已导出当前战役（不含其他战役）');
  };

  const closeOnBg = e => { if (e.target === e.currentTarget) setModal(null); };

  return (
    <div className="shell">
      <aside>
        <div className="logo"><span>✦</span> CAMPAIGNER</div>
        <button className="campaign" onClick={() => setModal('switcher')}>
          <small>当前战役 · 点击切换</small>
          <strong>{campaign.name}</strong>
          <span>{campaign.system} · {campaign.sessions.length} 章 · {campaign.characters.length} 角色</span>
        </button>
        <nav>
          {[['timeline', '◌', '时间线'], ['characters', '♙', '角色与阵营'], ['places', '⌖', '地点图鉴'], ['loot', '◇', '战利品']].map(([id, i, t]) => (
            <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}><i>{i}</i>{t}</button>
          ))}
        </nav>
        <div className="side-bottom">
          <button>⚙ 偏好设置</button>
          <small>本地存储已开启 · 共 {store.campaigns.length} 个战役</small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="crumb">MY CAMPAIGN / {campaign.system}</span>
            <h1>{tab === 'timeline' ? '战役时间线' : tab === 'characters' ? '角色与阵营' : tab === 'places' ? '地点图鉴' : '战利品'}</h1>
          </div>
          <div className="actions">
            <button onClick={exportData} className="outline">↓ 导出当前战役</button>
            <button onClick={() => { setFormErr(''); setModal('chapter'); }} className="primary">＋ 新建章节</button>
          </div>
        </header>

        {tab === 'timeline' && (
          <div className="timeline-layout">
            <section className="timeline">
              <div className="timeline-intro">
                <div><span>THE CHRONICLE</span><h2>记录每一次冒险</h2></div>
                <span className="count">{campaign.sessions.length} CHAPTERS</span>
              </div>
              {campaign.sessions.length === 0 && (
                <div className="no-chapters">本战役还没有章节，点击右上角「新建章节」开始记录。</div>
              )}
              {campaign.sessions.map((s, i) => (
                <button className={'chapter ' + (cur && cur.id === s.id ? 'selected' : '')} onClick={() => setActiveSession(s.id)} key={s.id}>
                  <div className="date">
                    <b>{new Date(s.date).toLocaleDateString('zh-CN', {month: '2-digit', day: '2-digit'})}</b>
                    <small>{new Date(s.date).getFullYear()}</small>
                  </div>
                  <div className="line"><span style={{background: s.color}}></span>{i < campaign.sessions.length - 1 && <i/>}</div>
                  <div className="chapter-copy">
                    <div className="tag">{s.tag}</div>
                    <h3>{s.title}</h3>
                    <p>{s.summary}</p>
                  </div>
                  <span className="arrow">↗</span>
                </button>
              ))}
            </section>
            <section className="detail-panel">
              {cur ? (
                <>
                  <div className="detail-cover" style={{background: cur.color}}>
                    <span>CHAPTER {String(chapterNo).padStart(2, '0')}</span><i>✦</i>
                  </div>
                  <div className="detail-body">
                    <span className="tag">{cur.tag}</span>
                    <h2>{cur.title}</h2>
                    <p>{cur.summary}</p>
                    <div className="meta-grid">
                      <div><small>游戏日期</small><strong>{cur.date}</strong></div>
                      <div><small>参与者</small><strong>{(cur.participants && cur.participants.length) ? cur.participants.join('、') : '未记录'}</strong></div>
                    </div>
                    <div className="note">
                      <span>✎</span>
                      <div><strong>笔记</strong><p>点击编辑这一章节的剧情细节、重要决定和未解线索。</p></div>
                      <button onClick={() => setNotice('笔记编辑已开启')}>编辑</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="detail-empty">选择或新建一个章节查看详情。</div>
              )}
            </section>
          </div>
        )}

        {tab === 'characters' && (
          <section className="cards">
            <div className="section-note">
              <span>队伍中有 {campaign.characters.length} 位冒险者。移除角色只影响角色表，已记录的章节正文与参与者姓名会保留。</span>
              <button className="mini" onClick={() => setModal('character')}>＋ 添加角色</button>
            </div>
            {campaign.characters.length === 0 && (
              <div className="no-chapters">本战役还没有角色，先添加一位，才能在新建章节时勾选参与者。</div>
            )}
            {campaign.characters.map(c => (
              <article className="char-card" key={c.id}>
                <div className="avatar" style={{background: c.color}}>{c.name[0]}</div>
                <div>
                  <small>{c.role}</small>
                  <h3>{c.name}</h3>
                  <p>玩家 · {c.player}</p>
                </div>
                <button className="remove" title="从角色表移除" onClick={() => setRemoving(c)}>✕</button>
              </article>
            ))}
          </section>
        )}

        {tab === 'places' && (
          <section className="empty">
            <div>⌖</div>
            <h2>地点图鉴</h2>
            <p>从章节笔记中收集地点。当前已记录灰港、雾林和失落钟楼。</p>
            <div className="place-list">
              <span>01　灰港 <b>已探索</b></span>
              <span>02　失落钟楼 <b>已探索</b></span>
              <span>03　雾林 <b>待探索</b></span>
            </div>
          </section>
        )}

        {tab === 'loot' && (
          <section className="empty">
            <div>◇</div>
            <h2>战利品清单</h2>
            <p>追踪旅途中获得的装备、遗物和金币。</p>
            <div className="place-list">
              <span>月光草 × 3 <b>消耗品</b></span>
              <span>古老铜币 × 1 <b>遗物</b></span>
              <span>灰港守卫徽章 × 2 <b>任务物品</b></span>
            </div>
          </section>
        )}
      </main>

      {modal === 'switcher' && (
        <div className="modal-bg" onClick={closeOnBg}>
          <div className="modal">
            <button className="close" onClick={() => setModal(null)}>×</button>
            <span className="crumb">CAMPAIGNS</span>
            <h2>切换战役</h2>
            <div className="camp-list">
              {store.campaigns.map(c => (
                <button key={c.id} className={'camp-item' + (c.id === campaign.id ? ' on' : '')} onClick={() => switchCampaign(c.id)}>
                  <div>
                    <strong>{c.name}</strong>
                    <small>{c.system} · {c.sessions.length} 章 · {c.characters.length} 角色</small>
                  </div>
                  {c.id === campaign.id ? <span className="cur">当前</span> : <span className="go">切换 →</span>}
                </button>
              ))}
            </div>
            <button className="outline full" onClick={() => setModal('campaign')}>＋ 新建战役</button>
          </div>
        </div>
      )}

      {modal === 'campaign' && (
        <div className="modal-bg" onClick={closeOnBg}>
          <div className="modal">
            <button className="close" onClick={() => setModal(null)}>×</button>
            <span className="crumb">NEW CAMPAIGN</span>
            <h2>开启新的战役</h2>
            <label>战役名称<input value={campForm.name} onChange={e => setCampForm({...campForm, name: e.target.value})} placeholder="例：雾都谜影"/></label>
            <label>规则系统<input value={campForm.system} onChange={e => setCampForm({...campForm, system: e.target.value})} placeholder="例：克苏鲁的呼唤 7版"/></label>
            <button className="primary full" onClick={addCampaign}>创建并切换</button>
          </div>
        </div>
      )}

      {modal === 'character' && (
        <div className="modal-bg" onClick={closeOnBg}>
          <div className="modal">
            <button className="close" onClick={() => setModal(null)}>×</button>
            <span className="crumb">NEW CHARACTER</span>
            <h2>添加角色到「{campaign.name}」</h2>
            <label>角色姓名<input value={charForm.name} onChange={e => setCharForm({...charForm, name: e.target.value})} placeholder="例：艾德里安"/></label>
            <label>职业 / 定位<input value={charForm.role} onChange={e => setCharForm({...charForm, role: e.target.value})} placeholder="例：圣骑士"/></label>
            <label>玩家<input value={charForm.player} onChange={e => setCharForm({...charForm, player: e.target.value})} placeholder="例：林默"/></label>
            <button className="primary full" onClick={addCharacter}>加入角色表</button>
          </div>
        </div>
      )}

      {modal === 'chapter' && (
        <div className="modal-bg" onClick={closeOnBg}>
          <div className="modal">
            <button className="close" onClick={() => setModal(null)}>×</button>
            <span className="crumb">NEW CHAPTER</span>
            <h2>记录新的章节</h2>
            <label>章节标题<input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="例：第三章：月下集市"/></label>
            <label>游戏日期<input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})}/></label>
            <label>章节摘要<textarea rows="3" value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} placeholder="发生了什么？"/></label>
            <label>章节类型<select value={form.tag} onChange={e => setForm({...form, tag: e.target.value})}><option>主线</option><option>支线</option><option>番外</option></select></label>
            <label>参与者（从本战役角色中勾选，至少一位）</label>
            {campaign.characters.length > 0 ? (
              <div className="chips">
                {campaign.characters.map(c => (
                  <button type="button" key={c.id} className={'chip' + (form.participants.includes(c.name) ? ' on' : '')} onClick={() => toggleParticipant(c.name)}>
                    {form.participants.includes(c.name) ? '✓ ' : ''}{c.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="err">本战役还没有角色，请先在「角色与阵营」中添加。</p>
            )}
            {formErr && <p className="err">{formErr}</p>}
            <button className="primary full" onClick={addChapter}>保存章节</button>
          </div>
        </div>
      )}

      {removing && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setRemoving(null); }}>
          <div className="modal">
            <button className="close" onClick={() => setRemoving(null)}>×</button>
            <span className="crumb">REMOVE CHARACTER</span>
            <h2>移除 {removing.name}？</h2>
            {removingRefs.length > 0 ? (
              <>
                <p className="warn-copy">以下 {removingRefs.length} 个章节仍记录了 {removing.name} 的参与：</p>
                <div className="refs">
                  {removingRefs.map(s => <span key={s.id}>{s.title}<small>{s.date}</small></span>)}
                </div>
                <p className="warn-copy">确认后仅从角色表移除；这些章节的正文与参与者姓名仍会保留。</p>
              </>
            ) : (
              <p className="warn-copy">没有章节引用该角色，可以安全移除。</p>
            )}
            <div className="modal-row">
              <button className="ghost" onClick={() => setRemoving(null)}>取消</button>
              <button className="danger" onClick={confirmRemove}>确认移除</button>
            </div>
          </div>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App/>);
