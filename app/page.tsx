'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/firebase/config';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  setDoc,
} from 'firebase/firestore';

const tabs = ['Records', 'UFL PC', 'UFL PS5', 'UFL XBOX', 'Fights', 'Admin'] as const;
type Tab = typeof tabs[number];
const platforms = ['UFL PC', 'UFL PS5', 'UFL XBOX'] as const;
type Platform = typeof platforms[number];

type Fighter = {
  id: string;
  previousRank: number;
  name: string;
  platform: Platform;
  wins: number;
  losses: number;
  draws: number;
  koWins: number;
  champion?: boolean;
};

type Fight = {
  id: string;
  fighter1: string;
  fighter2: string;
  winner: string;
  method: 'KO' | 'Decision' | 'Draw';
  platform: Platform;
  date: string;
};

export default function Home() {
  const [tab, setTab] = useState<Tab>('Records');
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [fights, setFights] = useState<Fight[]>([]);
  const [adminMode, setAdminMode] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  const getSortedFighters = (platform: Platform) => {
    return fighters
      .filter(f => f.platform === platform && !f.champion)
      .sort((a, b) => {
        const scoreA = a.wins * 5 - a.losses * 2 + a.koWins;
        const scoreB = b.wins * 5 - b.losses * 2 + b.koWins;
        return scoreB - scoreA;
      })
      .slice(0, 15);
  };

  const handleDeleteFight = async (id: string) => {
    console.log('Deleting fight:', id); // optional debug
    await deleteDoc(doc(db, 'fights', id));
    await fetchFights();    // refresh list after deletion
    await fetchFighters();  // refresh records too
  };  
  
  const handleAddFight = async () => {
    const { fighter1, fighter2, winner, method, date, platform } = newFight;
    if (!fighter1 || !fighter2 || !winner || !method || !date) return;
  
    await addDoc(collection(db, 'fights'), {
      fighter1,
      fighter2,
      winner,
      method,
      date,
      platform,
    });
  
    await updateRecordsAfterFight(newFight); // update stats
  
    await fetchFighters(); // <-- Refresh fighters after update
    await fetchFights();   // optional: refresh fights list
  
    setNewFight({
  id: crypto.randomUUID(),
  fighter1: '',
  fighter2: '',
  winner: '',
      method: 'Decision',
      date: '',
      platform: 'UFL PC',
    });
  };     

  const handleAddFighter = async () => {
    if (!newFighter.name.trim()) return;
  
    await setDoc(doc(db, 'fighters', `${newFighter.name}-${newFighter.platform}`), {
      name: newFighter.name,
      platform: newFighter.platform,
      wins: 0,
      losses: 0,
      draws: 0,
      koWins: 0,
      champion: false,
    });
  
    await fetchFighters();
    setNewFighter({ name: '', platform: 'UFL PC' });
  };  

  const updateRecordsAfterFight = async (fight: Fight) => {
    const updated = [...fighters];
  
    for (const f of updated) {
      if (f.name === fight.fighter1 || f.name === fight.fighter2) {
        const isWinner = f.name === fight.winner;
        const isDraw = fight.method === 'Draw';
        const isKO = fight.method === 'KO';
  
        f.wins += isWinner && !isDraw ? 1 : 0;
        f.losses += !isWinner && !isDraw ? 1 : 0;
        f.draws += isDraw ? 1 : 0;
        f.koWins += isWinner && isKO ? 1 : 0;
  
        await updateDoc(doc(db, 'fighters', `${f.name}-${f.platform}`), {
          wins: f.wins,
          losses: f.losses,
          draws: f.draws,
          koWins: f.koWins,
        });
      }
    }
  
    await fetchFighters(); // ✅ Refresh fighters in UI
  };   

  const updateFighterField = (
    id: string,
    field: keyof Fighter,
    value: any
  ) => {
    setFighters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
    );
  };  

// Admin form state
const [newFighter, setNewFighter] = useState({ name: '', platform: 'UFL PC' as Platform });
const [newFight, setNewFight] = useState<Fight>({
  id: '',               // ✅ ADD THIS
  fighter1: '',
  fighter2: '',
  winner: '',
  method: 'Decision',
  platform: 'UFL PC',
  date: '',
});

const [fighterSearch1, setFighterSearch1] = useState('');
const [fighterSearch2, setFighterSearch2] = useState('');
const [searchFighter, setSearchFighter] = useState('');
const [searchFight, setSearchFight] = useState('');

const fetchFights = async () => {
  const snapshot = await getDocs(collection(db, 'fights'));
  const data = snapshot.docs.map(doc => ({
    id: doc.id, // ✅ Needed for deleting/editing
    ...doc.data()
  })) as Fight[];

  setFights(data);
};

  const getFighterStats = (name: string) => {
    const fighterFights = fights.filter(
      f => f.fighter1 === name || f.fighter2 === name
    );
  
    let wins = 0, losses = 0, draws = 0, koWins = 0;
  
    fighterFights.forEach(f => {
      if (f.method === 'Draw') {
        draws++;
      } else if (f.winner === name) {
        wins++;
        if (f.method === 'KO') koWins++;
      } else {
        losses++;
      }
    });
  
    return { wins, losses, draws, koWins };
  };  

  const addFighter = async () => {
    if (!newFighter.name) return;
    const exists = fighters.find(f => f.name === newFighter.name);
    if (exists) return alert('Fighter already exists!');
    const fighter: Fighter = { ...newFighter, id: crypto.randomUUID(), wins: 0, losses: 0, draws: 0, koWins: 0, previousRank: 0, champion: false };
    await addDoc(collection(db, 'fighters'), fighter);
    fetchFighters();
    setNewFighter({ name: '', platform: 'UFL PC' });
  };

  const addFight = async () => {
    const f1 = fighters.find(f => f.name === newFight.fighter1);
    const f2 = fighters.find(f => f.name === newFight.fighter2);
    if (!f1 || !f2) return alert('Fighters must exist');

    // Update records
    const updatedFighters = fighters.map(f => {
      if (f.name === newFight.fighter1 || f.name === newFight.fighter2) {
        const isWinner = f.name === newFight.winner;
        const isDraw = newFight.method === 'Draw';
        return {
          ...f,
          wins: isWinner && !isDraw ? f.wins + 1 : f.wins,
          losses: !isWinner && !isDraw ? f.losses + 1 : f.losses,
          draws: isDraw ? f.draws + 1 : f.draws,
          koWins: isWinner && newFight.method === 'KO' ? f.koWins + 1 : f.koWins,
        };
      }
      return f;
    });

    // Save updated fighters
    const snapshot = await getDocs(collection(db, 'fighters'));
    snapshot.docs.forEach(async d => {
      const data = d.data() as Fighter;
      const updated = updatedFighters.find(f => f.name === data.name);
      if (updated) await updateDoc(doc(db, 'fighters', d.id), updated);
    });

    await addDoc(collection(db, 'fights'), newFight);
    setNewFight({
  id: crypto.randomUUID(),
  fighter1: '',
  fighter2: '',
  winner: '', method: 'Decision', platform: 'UFL PC', date: '' });
    fetchFights();
    fetchFighters();
  };

  const calculateRanking = (platform: Platform) => {
    const platformFighters = fighters.filter(f => f.platform === platform);
    const scores = platformFighters.map(f => {
      const recentFights = fights.filter(fight => fight.platform === platform);
      const opponents = recentFights.filter(
        fight => fight.winner === f.name
      ).map(fight => {
        const opponentName = fight.fighter1 === f.name ? fight.fighter2 : fight.fighter1;
        return fighters.find(x => x.name === opponentName)?.wins || 0;
      });
      const quality = opponents.reduce((a, b) => a + b, 0);
      return {
        fighter: f,
        score: f.wins * 5 - f.losses * 2 + quality,
      };
    });

    scores.sort((a, b) => b.score - a.score);
    return scores.map(s => s.fighter);
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === 'G36DSFGB3873GFDIY38HS9I34G') setAdminMode(true);
    setPasswordInput('');
  };

// ✅ Step 1: fetchFighters defined BEFORE useEffect
const fetchFighters = async () => {
  const snapshot = await getDocs(collection(db, 'fighters'));
  const data = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Fighter[];

  setFighters(data);
};

// ✅ Step 2: useEffect calls it safely
useEffect(() => {
  fetchFighters();
  fetchFights();
}, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black text-white p-4">
      <div className="text-center text-4xl font-bold mb-6">UFL World Rankings</div>

      <div className="flex justify-center gap-4 mb-6 flex-wrap">
        {tabs.map(t => (
          <motion.button
            key={t}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className={`px-4 py-2 rounded-2xl text-lg shadow-md ${
              tab === t ? 'bg-white text-black' : 'bg-gray-800'
            }`}
            onClick={() => setTab(t)}
          >
            {t}
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="max-w-4xl mx-auto"
        >
{tab === 'Records' && (
  <div className="space-y-4">
    {fighters
      .filter(f => f.name?.trim())
      .map(f => {
        const stats = getFighterStats(f.name);
        return (
          <div key={f.name} className="bg-gray-800 p-4 rounded-xl shadow-lg flex justify-between items-center">
            <div>
              <div className="text-xl font-semibold">{f.name}</div>
              <div className="text-sm text-gray-300">{f.platform}</div>
            </div>
            <div className="text-right">
              <div>W: {stats.wins} | L: {stats.losses} | D: {stats.draws}</div>
              <div>KO Wins: {stats.koWins}</div>
            </div>
          </div>
        );
      })}
  </div>
)}

          {tab === 'Fights' && (
            <div className="space-y-4">
              {fights.map((f, i) => (
                <div key={i} className="bg-gray-800 p-4 rounded-xl shadow">
                  <div className="font-semibold">{f.fighter1} vs {f.fighter2}</div>
                  <div>Winner: {f.winner} by {f.method} on {f.date}</div>
                </div>
              ))}
            </div>
          )}

{tab === 'UFL PC' && (
  <>
    <h2 className="text-2xl font-bold mb-4">👑 Champion</h2>
    {fighters
      .filter(f => f.platform === 'UFL PC' && f.champion)
      .map(f => (
        <div key={f.name} className="bg-gray-800 text-white p-4 rounded mb-4">
          <p className="text-xl font-bold">{f.name}</p>
          <p>W: {f.wins} | L: {f.losses} | D: {f.draws} | KO: {f.koWins}</p>
        </div>
      ))}

    <h2 className="text-2xl font-bold mb-2">Top 15 Contenders</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {fighters
        .filter(f => f.platform === 'UFL PC' && !f.champion)
        .sort((a, b) => {
          const scoreA = a.wins * 5 - a.losses * 2 + a.koWins * 2;
          const scoreB = b.wins * 5 - b.losses * 2 + b.koWins * 2;
          return scoreB - scoreA;
        })
        .slice(0, 15)
        .map((f, index) => (
          <div key={f.name} className="bg-gray-800 text-white p-4 rounded">
            <div className="flex justify-between mb-2">
              <h3 className="text-lg font-semibold">{f.name}</h3>
              <span className="text-sm text-gray-300">#{index + 1}</span>
            </div>
            {(() => {
  const stats = getFighterStats(f.name);
  return (
    <>
      <p>W: {stats.wins} | L: {stats.losses} | D: {stats.draws}</p>
      <p>KO Wins: {stats.koWins}</p>
    </>
  );
})()}
          </div>
        ))}
    </div>
  </>
)}

{tab === 'UFL PS5' && (
  <>
    <h2 className="text-2xl font-bold mb-4">👑 Champion</h2>
    {fighters
      .filter(f => f.platform === 'UFL PS5' && f.champion)
      .map(f => (
        <div key={f.name} className="bg-gray-800 text-white p-4 rounded mb-4">
          <p className="text-xl font-bold">{f.name}</p>
          <p>W: {f.wins} | L: {f.losses} | D: {f.draws} | KO: {f.koWins}</p>
        </div>
      ))}

    <h2 className="text-2xl font-bold mb-2">Top 15 Contenders</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {fighters
        .filter(f => f.platform === 'UFL PS5' && !f.champion)
        .sort((a, b) => {
          const scoreA = a.wins * 5 - a.losses * 2 + a.koWins * 2;
          const scoreB = b.wins * 5 - b.losses * 2 + b.koWins * 2;
          return scoreB - scoreA;
        })
        .slice(0, 15)
        .map((f, index) => (
          <div key={f.name} className="bg-gray-800 text-white p-4 rounded">
            <div className="flex justify-between mb-2">
              <h3 className="text-lg font-semibold">{f.name}</h3>
              <span className="text-sm text-gray-300">#{index + 1}</span>
            </div>
            {(() => {
  const stats = getFighterStats(f.name);
  return (
    <>
      <p>W: {stats.wins} | L: {stats.losses} | D: {stats.draws}</p>
      <p>KO Wins: {stats.koWins}</p>
    </>
  );
})()}
          </div>
        ))}
    </div>
  </>
)}

{tab === 'UFL XBOX' && (
  <>
    <h2 className="text-2xl font-bold mb-4">👑 Champion</h2>
    {fighters
      .filter(f => f.platform === 'UFL XBOX' && f.champion)
      .map(f => (
        <div key={f.name} className="bg-gray-800 text-white p-4 rounded mb-4">
          <p className="text-xl font-bold">{f.name}</p>
          <p>W: {f.wins} | L: {f.losses} | D: {f.draws} | KO: {f.koWins}</p>
        </div>
      ))}

    <h2 className="text-2xl font-bold mb-2">Top 15 Contenders</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {fighters
        .filter(f => f.platform === 'UFL XBOX' && !f.champion)
        .sort((a, b) => {
          const scoreA = a.wins * 5 - a.losses * 2 + a.koWins * 2;
          const scoreB = b.wins * 5 - b.losses * 2 + b.koWins * 2;
          return scoreB - scoreA;
        })
        .slice(0, 15)
        .map((f, index) => (
          <div key={f.name} className="bg-gray-800 text-white p-4 rounded">
            <div className="flex justify-between mb-2">
              <h3 className="text-lg font-semibold">{f.name}</h3>
              <span className="text-sm text-gray-300">#{index + 1}</span>
            </div>
            {(() => {
  const stats = getFighterStats(f.name);
  return (
    <>
      <p>W: {stats.wins} | L: {stats.losses} | D: {stats.draws}</p>
      <p>KO Wins: {stats.koWins}</p>
    </>
  );
})()}
          </div>
        ))}
    </div>
  </>
)}

{tab === 'Admin' && (
  <div className="flex flex-col items-center gap-6 mt-4">
    {!adminMode ? (
      <div className="flex items-center gap-2">
        <input
          type="password"
          placeholder="Enter admin password"
          value={passwordInput}
          onChange={e => setPasswordInput(e.target.value)}
          className="bg-gray-700 px-4 py-2 rounded-xl"
        />
        <button onClick={handlePasswordSubmit} className="bg-blue-500 px-4 py-2 rounded-xl">Submit</button>
      </div>
    ) : (
      <div className="w-full space-y-6">
        <div className="text-center text-green-400 font-bold">Admin Mode ✅</div>

        {/* ADD FIGHTER */}
        <div className="bg-gray-800 p-4 rounded-xl space-y-2">
          <h2 className="text-xl font-semibold">➕ Add Fighter</h2>
          <input
            type="text"
            placeholder="Fighter Name"
            value={newFighter.name}
            onChange={e => setNewFighter({ ...newFighter, name: e.target.value })}
            className="bg-gray-700 px-4 py-2 rounded-xl w-full"
          />
          <select
            value={newFighter.platform}
            onChange={e => setNewFighter({ ...newFighter, platform: e.target.value as Platform })}
            className="bg-gray-700 px-4 py-2 rounded-xl w-full"
          >
            {platforms.map(p => <option key={p}>{p}</option>)}
          </select>
          <button onClick={addFighter} className="bg-green-600 px-4 py-2 rounded-xl w-full">Add Fighter</button>
        </div>

        {/* ADD FIGHT */}
        <div className="bg-gray-800 p-4 rounded-xl space-y-2">
          <h2 className="text-xl font-semibold">🥊 Add Fight</h2>

          {/* Searchable Fighter 1 */}
          <div className="relative w-full">
            <input
              type="text"
              placeholder="Search Fighter 1"
              className="bg-gray-700 px-4 py-2 rounded-xl w-full"
              value={fighterSearch1}
              onChange={e => setFighterSearch1(e.target.value)}
            />
            {fighterSearch1 && (
              <ul className="absolute z-10 bg-gray-800 w-full mt-1 max-h-48 overflow-y-auto rounded-xl shadow">
                {platforms.map(platform => {
                  const filtered = fighters
                    .filter(f =>
                      f.platform === platform &&
                      f.name.toLowerCase().includes(fighterSearch1.toLowerCase()) &&
                      f.name !== newFight.fighter2
                    )
                    .sort((a, b) => a.name.localeCompare(b.name));
                  if (!filtered.length) return null;
                  return (
                    <li key={platform} className="text-gray-400 px-4 pt-2 pb-1 text-sm">
                      {platform}
                      <ul>
                        {filtered.map(f => (
                          <li
                            key={f.name}
                            onClick={() => {
                              setNewFight({ ...newFight, fighter1: f.name });
                              setFighterSearch1(''); // ✅ closes dropdown
                            }}                            
                            className="cursor-pointer px-4 py-2 hover:bg-gray-700"
                          >
                            {f.name}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Searchable Fighter 2 */}
          <div className="relative w-full">
            <input
              type="text"
              placeholder="Search Fighter 2"
              className="bg-gray-700 px-4 py-2 rounded-xl w-full"
              value={fighterSearch2}
              onChange={e => setFighterSearch2(e.target.value)}
            />
            {fighterSearch2 && (
              <ul className="absolute z-10 bg-gray-800 w-full mt-1 max-h-48 overflow-y-auto rounded-xl shadow">
                {platforms.map(platform => {
                  const filtered = fighters
                    .filter(f =>
                      f.platform === platform &&
                      f.name.toLowerCase().includes(fighterSearch2.toLowerCase()) &&
                      f.name !== newFight.fighter1
                    )
                    .sort((a, b) => a.name.localeCompare(b.name));
                  if (!filtered.length) return null;
                  return (
                    <li key={platform} className="text-gray-400 px-4 pt-2 pb-1 text-sm">
                      {platform}
                      <ul>
                        {filtered.map(f => (
                          <li
                            key={f.name}
                            onClick={() => {
                              setNewFight({ ...newFight, fighter2: f.name });
                              setFighterSearch2(''); // ✅ closes dropdown
                            }}                            
                            className="cursor-pointer px-4 py-2 hover:bg-gray-700"
                          >
                            {f.name}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <select
            value={newFight.winner}
            onChange={e => setNewFight({ ...newFight, winner: e.target.value })}
            className="bg-gray-700 px-4 py-2 rounded-xl w-full"
          >
            <option value="">Select Winner</option>
            {[newFight.fighter1, newFight.fighter2].filter(Boolean).map(name => (
              <option key={name}>{name}</option>
            ))}
          </select>

          <select
            value={newFight.method}
            onChange={e => setNewFight({ ...newFight, method: e.target.value as Fight['method'] })}
            className="bg-gray-700 px-4 py-2 rounded-xl w-full"
          >
            <option>KO</option>
            <option>Decision</option>
            <option>Draw</option>
          </select>

          <input
            type="date"
            value={newFight.date}
            onChange={e => setNewFight({ ...newFight, date: e.target.value })}
            className="bg-gray-700 px-4 py-2 rounded-xl w-full"
          />

          <select
            value={newFight.platform}
            onChange={e => setNewFight({ ...newFight, platform: e.target.value as Platform })}
            className="bg-gray-700 px-4 py-2 rounded-xl w-full"
          >
            {platforms.map(p => <option key={p}>{p}</option>)}
          </select>

          <button onClick={addFight} className="bg-red-600 px-4 py-2 rounded-xl w-full">Submit Fight</button>
        </div>

{/* MANAGE FIGHTERS */}
<div className="bg-gray-800 p-4 rounded-xl space-y-4">
  <h2 className="text-xl font-semibold">🧠 Manage Fighters</h2>
  <input
    type="text"
    placeholder="Search fighters..."
    className="bg-gray-700 px-4 py-2 rounded-xl w-full"
    value={searchFighter}
    onChange={e => setSearchFighter(e.target.value)}
  />
  {fighters
    .filter(
      f => f.name?.trim() && f.name.toLowerCase().includes(searchFighter.toLowerCase())
    )
    .map((f, i) => (
      <div
        key={f.id}
        className="bg-gray-900 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
      >
        {/* Name and Platform Select */}
        <div className="flex-1 space-y-1">
          <input
            type="text"
            value={f.name}
            onChange={e => {
              const updatedFighters = fighters.map((fighter, index) =>
                index === i ? { ...fighter, name: e.target.value } : fighter
              );
              setFighters(updatedFighters);
            }}
            className="bg-gray-700 px-3 py-1 rounded w-full"
          />
<select
  value={f.platform}
  onChange={(e) =>
    updateFighterField(f.id!, 'platform', e.target.value as Platform)
  }
  className="rounded px-2 py-1 w-full bg-gray-700 text-white border border-gray-600 appearance-none"
>
  {platforms.map((p) => (
    <option key={p} value={p}>
      {p}
    </option>
  ))}
</select>

        </div>

        {/* Champion Toggle */}
        <button
          onClick={async () => {
            await updateDoc(doc(db, 'fighters', f.id), {
              ...f,
              champion: !f.champion,
            });
            fetchFighters();
          }}
          className={`px-3 py-1 rounded-xl font-bold ${
            f.champion ? 'bg-yellow-500 text-black' : 'bg-gray-600'
          }`}
        >
          {f.champion ? '✅ Champion' : '👑 Make Champion'}
        </button>

        {/* Save/Delete */}
        <div className="flex gap-2">
        <button
  onClick={async () => {
    // Delete old doc
    await deleteDoc(doc(db, 'fighters', f.id));

    // Create new doc with new ID (name-platform)
    const newId = `${f.name}-${f.platform}`;
    await setDoc(doc(db, 'fighters', newId), {
      name: f.name,
      platform: f.platform,
      wins: f.wins,
      losses: f.losses,
      draws: f.draws,
      koWins: f.koWins,
      champion: f.champion ?? false,
    });

    fetchFighters();
  }}
  className="bg-green-500 text-white px-3 py-1 rounded"
>
  Save
</button>

          <button
            onClick={async () => {
              await deleteDoc(doc(db, 'fighters', f.id));
              fetchFighters();
            }}
            className="bg-red-600 px-3 py-1 rounded-xl"
          >
            Delete
          </button>
        </div>
      </div>
    ))}
</div>

        {/* MANAGE FIGHTS */}
        <div className="bg-gray-800 p-4 rounded-xl space-y-4">
          <h2 className="text-xl font-semibold">📜 Manage Fights</h2>
          <input
            type="text"
            placeholder="Search fights by fighter or date..."
            className="bg-gray-700 px-4 py-2 rounded-xl w-full"
            value={searchFight}
            onChange={e => setSearchFight(e.target.value)}
          />
          {fights
            .filter(f =>
              f.fighter1.toLowerCase().includes(searchFight.toLowerCase()) ||
              f.fighter2.toLowerCase().includes(searchFight.toLowerCase()) ||
              f.date.includes(searchFight)
            )
            .map((fight, index) => (
              <div
                key={index}
                className="bg-gray-900 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div className="text-sm flex-1">
                  <div className="font-semibold">{fight.fighter1} vs {fight.fighter2}</div>
                  <div>Winner: {fight.winner} | Method: {fight.method} | Date: {fight.date}</div>
                </div>
                <button
onClick={() => handleDeleteFight(fight.id)}
  className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded"
>
  Delete
</button>
              </div>
            ))}
        </div>
      </div>
    )}
  </div>
)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
