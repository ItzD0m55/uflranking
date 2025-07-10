'use client';

import { useState, useEffect } from 'react';
import { differenceInDays } from 'date-fns';
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
  firebaseId: string; // ✅ add this
  name: string;
  platform: Platform;
  wins: number;
  losses: number;
  draws: number;
  koWins: number;
  champion?: boolean;
};

type Fight = {
  id: string; // ✅ This must be defined
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
  const [search, setSearch] = useState('');
  const [fights, setFights] = useState<Fight[]>([]);
  const [adminMode, setAdminMode] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  const updateFighterNameInFights = async (oldName: string, newName: string) => {
    const snapshot = await getDocs(collection(db, 'fights'));
  
    const updates = snapshot.docs.map(async (docSnap) => {
      const fight = docSnap.data() as Fight;
      const updatedFight = { ...fight };
  
      let changed = false;
  
      if (fight.fighter1 === oldName) {
        updatedFight.fighter1 = newName;
        changed = true;
      }
      if (fight.fighter2 === oldName) {
        updatedFight.fighter2 = newName;
        changed = true;
      }
      if (fight.winner === oldName) {
        updatedFight.winner = newName;
        changed = true;
      }
  
      if (changed) {
        await updateDoc(doc(db, 'fights', docSnap.id), updatedFight);
      }
    });
  
    await Promise.all(updates);
  };  

  const resyncFighterRecords = async () => {
    const snapshot = await getDocs(collection(db, 'fighters'));
    const fightSnap = await getDocs(collection(db, 'fights'));
  
    const fightersData = snapshot.docs.map(doc => ({
      ...doc.data(),
      firebaseId: doc.id,
    })) as Fighter[];
  
    for (const fighter of fightersData) {
      const name = fighter.name;
      const fights = fightSnap.docs.map(doc => doc.data()) as Fight[];
  
      const relevantFights = fights.filter(
        fight => fight.fighter1 === name || fight.fighter2 === name
      );
  
      let wins = 0, losses = 0, draws = 0, koWins = 0;
  
      relevantFights.forEach(fight => {
        if (fight.winner === name) {
          wins++;
          if (fight.method === 'KO') koWins++;
        } else if (
          (fight.fighter1 === name || fight.fighter2 === name) &&
          fight.winner === 'Draw'
        ) {
          draws++;
        } else if (
          fight.fighter1 === name ||
          fight.fighter2 === name
        ) {
          losses++;
        }
      });
  
      await updateDoc(doc(db, 'fighters', fighter.firebaseId), {
        wins,
        losses,
        draws,
        koWins,
      });
    }
  
    await fetchFighters(); // Refresh state
  };   

  const getSortedFighters = (platform: Platform): Fighter[] => {
    const fightersForPlatform = fighters.filter(f => f.platform === platform);
  
    const scored = fightersForPlatform.map(f => {
      const qualityScore = 0; // You can replace with logic based on who they beat
      const recencyBonus = 0; // You can replace with logic based on recent fights
  
      return {
        ...f,
        score: f.wins * 5 - f.losses * 2 + qualityScore + recencyBonus,
      };
    });
  
    const sorted = scored.sort((a, b) => b.score - a.score);
    const recentFights = fights.filter(f => f.platform === platform);
  
    return applyHeadToHeadOverrides(sorted, recentFights);
  };  
  
  const applyHeadToHeadOverrides = (fighters: Fighter[], fights: Fight[]): Fighter[] => {
    let sorted = [...fighters];
    const recentFights = fights.filter(f => differenceInDays(new Date(), new Date(f.date)) <= 20);
  
    let madeChange = true;
    while (madeChange) {
      madeChange = false;
  
      for (const fight of recentFights) {
        const winnerName = fight.winner;
        const loserName = fight.fighter1 === winnerName ? fight.fighter2 : fight.fighter1;
  
        const winnerIndex = sorted.findIndex(f => f.name === winnerName && f.platform === fight.platform);
        const loserIndex = sorted.findIndex(f => f.name === loserName && f.platform === fight.platform);
  
        if (winnerIndex > -1 && loserIndex > -1 && winnerIndex > loserIndex) {
          // Move winner above loser
          const [winnerFighter] = sorted.splice(winnerIndex, 1);
          sorted.splice(loserIndex, 0, winnerFighter);
          madeChange = true;
        }
      }
    }
  
    return sorted;
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
    id: doc.id, // 👈 Important: Add this line
    ...doc.data(),
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
    const exists = fighters.find(f => f.name === newFighter.name && f.platform === newFighter.platform);
    if (exists) return alert('Fighter with this name already exists on this platform!');
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
  const data = snapshot.docs.map(doc => {
    const fighter = doc.data() as Fighter;
    return {
      ...fighter,
      firebaseId: doc.id,
      originalName: fighter.name, // ✅ Required for renaming sync
    };
  });
  

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

      
{(tab === 'Records' || tab === 'Fights') && (
  <div className="flex justify-center mb-4">
    <input
      type="text"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Search..."
      className="px-4 py-2 w-full max-w-md rounded-xl text-white bg-gray-800 border border-gray-600"
    />
  </div>
)}

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
.filter(f => adminMode || f.name?.trim())
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
        
          const aBeatB = fights.some(
            f => f.winner === a.name && (f.fighter1 === b.name || f.fighter2 === b.name)
          );
          const bBeatA = fights.some(
            f => f.winner === b.name && (f.fighter1 === a.name || f.fighter2 === a.name)
          );
        
          if (aBeatB && !bBeatA) return -1; // A beat B, rank higher
          if (bBeatA && !aBeatB) return 1;  // B beat A, rank higher
        
          return scoreB - scoreA; // fallback
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
        
          const aBeatB = fights.some(
            f => f.winner === a.name && (f.fighter1 === b.name || f.fighter2 === b.name)
          );
          const bBeatA = fights.some(
            f => f.winner === b.name && (f.fighter1 === a.name || f.fighter2 === a.name)
          );
        
          if (aBeatB && !bBeatA) return -1; // A beat B, rank higher
          if (bBeatA && !aBeatB) return 1;  // B beat A, rank higher
        
          return scoreB - scoreA; // fallback
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
        
          const aBeatB = fights.some(
            f => f.winner === a.name && (f.fighter1 === b.name || f.fighter2 === b.name)
          );
          const bBeatA = fights.some(
            f => f.winner === b.name && (f.fighter1 === a.name || f.fighter2 === a.name)
          );
        
          if (aBeatB && !bBeatA) return -1; // A beat B, rank higher
          if (bBeatA && !aBeatB) return 1;  // B beat A, rank higher
        
          return scoreB - scoreA; // fallback
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
  <div className="p-4">
    {!adminMode ? (
      <div className="max-w-sm mx-auto bg-gray-900 p-6 rounded-xl shadow space-y-4 text-center">
        <h2 className="text-2xl font-bold text-white">Admin Login</h2>
        <input
          type="password"
          placeholder="Enter admin password"
          className="bg-gray-800 text-white px-4 py-2 rounded w-full"
          value={passwordInput}
          onChange={e => setPasswordInput(e.target.value)}
        />
        <button
          onClick={handlePasswordSubmit}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded w-full"
        >
          Login
        </button>
      </div>
    ) : (
      <div className="space-y-8">

        {/* ➕ Add Fighter */}
        <div>
          <h2 className="text-xl font-bold mb-2">➕ Add Fighter</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Fighter name"
              value={newFighter.name}
              onChange={e => setNewFighter(prev => ({ ...prev, name: e.target.value }))}
              className="bg-gray-800 text-white px-2 py-1 rounded"
            />
            <select
              value={newFighter.platform}
              onChange={e => setNewFighter(prev => ({ ...prev, platform: e.target.value as Platform }))}
              className="bg-gray-800 text-white px-2 py-1 rounded"
            >
              {platforms.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddFighter}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            Add Fighter
          </button>
        </div>

        {/* 👑 Select Champion */}
        <div>
          <h2 className="text-xl font-bold mb-2">👑 Select Champion</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {platforms.map(p => (
              <div key={p}>
                <label className="text-white block mb-1">{p} Champion:</label>
                <select
                  value={fighters.find(f => f.platform === p && f.champion)?.name || ''}
                  onChange={async e => {
                    const selectedName = e.target.value;
                    const platformFighters = fighters.filter(f => f.platform === p);
                    for (const f of platformFighters) {
                      await updateDoc(doc(db, 'fighters', f.firebaseId), {
                        ...f,
                        champion: f.name === selectedName,
                      });
                    }
                    await fetchFighters();
                  }}
                  className="bg-gray-800 text-white px-2 py-1 rounded w-full"
                >
                  <option value="">None</option>
                  {fighters.filter(f => f.platform === p).map(f => (
                    <option key={f.firebaseId} value={f.name}>{f.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* 🥊 Add Fight */}
        <div>
          <h2 className="text-xl font-bold mb-2">🥊 Add Fight</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <select
              value={newFight.fighter1}
              onChange={e => setNewFight(prev => ({ ...prev, fighter1: e.target.value }))}
              className="bg-gray-800 text-white px-2 py-1 rounded"
            >
              <option value="">Fighter 1</option>
              {fighters.map(f => (
                <option key={f.firebaseId} value={f.name}>{f.name}</option>
              ))}
            </select>
            <select
              value={newFight.fighter2}
              onChange={e => setNewFight(prev => ({ ...prev, fighter2: e.target.value }))}
              className="bg-gray-800 text-white px-2 py-1 rounded"
            >
              <option value="">Fighter 2</option>
              {fighters.map(f => (
                <option key={f.firebaseId} value={f.name}>{f.name}</option>
              ))}
            </select>
            <select
              value={newFight.winner}
              onChange={e => setNewFight(prev => ({ ...prev, winner: e.target.value }))}
              className="bg-gray-800 text-white px-2 py-1 rounded"
            >
              <option value="">Winner</option>
              {[newFight.fighter1, newFight.fighter2, 'Draw'].map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            <select
              value={newFight.method}
              onChange={e => setNewFight(prev => ({ ...prev, method: e.target.value as 'KO' | 'Decision' | 'Draw' }))}
              className="bg-gray-800 text-white px-2 py-1 rounded"
            >
              <option value="Decision">Decision</option>
              <option value="KO">KO</option>
              <option value="Draw">Draw</option>
            </select>
            <select
              value={newFight.platform}
              onChange={e => setNewFight(prev => ({ ...prev, platform: e.target.value as Platform }))}
              className="bg-gray-800 text-white px-2 py-1 rounded"
            >
              {platforms.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input
              type="date"
              value={newFight.date}
              onChange={e => setNewFight(prev => ({ ...prev, date: e.target.value }))}
              className="bg-gray-800 text-white px-2 py-1 rounded"
            />
          </div>
          <button
            onClick={handleAddFight}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            Add Fight
          </button>
        </div>

        {/* 🧠 Manage Fighters */}
        <div>
          <h2 className="text-xl font-bold mb-2">🧠 Manage Fighters</h2>
          <input
            type="text"
            placeholder="Search fighters..."
            value={searchFighter}
            onChange={e => setSearchFighter(e.target.value)}
            className="mb-2 px-3 py-1 rounded bg-gray-800 text-white w-full"
          />
          <div className="grid grid-cols-1 gap-2">
            {fighters
              .filter(f => f.name.toLowerCase().includes(searchFighter.toLowerCase()))
              .map(f => (
                <div key={f.firebaseId} className="bg-gray-800 p-3 rounded shadow-md space-y-2">
                  <input
                    type="text"
                    value={f.name}
                    onChange={e =>
                      setFighters(prev =>
                        prev.map(x =>
                          x.firebaseId === f.firebaseId ? { ...x, name: e.target.value } : x
                        )
                      )
                    }
                    className="bg-gray-700 px-2 py-1 rounded text-white w-full"
                  />
                  <select
                    value={f.platform}
                    onChange={e =>
                      setFighters(prev =>
                        prev.map(x =>
                          x.firebaseId === f.firebaseId
                            ? { ...x, platform: e.target.value as Platform }
                            : x
                        )
                      )
                    }
                    className="bg-gray-700 text-white px-2 py-1 rounded w-full"
                  >
                    {platforms.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    {['wins', 'losses', 'draws', 'koWins'].map(stat => (
                      <input
                        key={stat}
                        type="number"
                        value={f[stat as keyof typeof f]}
                        onChange={e =>
                          setFighters(prev =>
                            prev.map(x =>
                              x.firebaseId === f.firebaseId
                                ? {
                                    ...x,
                                    [stat]: parseInt(e.target.value) || 0,
                                  }
                                : x
                            )
                          )
                        }
                        className="bg-gray-700 text-white px-2 py-1 rounded w-20"
                        placeholder={stat}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        const oldName = f.originalName ?? f.name;
                        const newName = f.name;
                        await updateDoc(doc(db, 'fighters', f.firebaseId), { ...f, name: newName });
                        await updateFighterNameInFights(oldName, newName);
                        await fetchFighters();
                        await fetchFights();
                        await resyncFighterRecords();
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded"
                    >
                      Save
                    </button>
                    <button
                      onClick={async () => {
                        await deleteDoc(doc(db, 'fighters', f.firebaseId));
                        const snap = await getDocs(collection(db, 'fights'));
                        const fightsToDelete = snap.docs.filter(doc =>
                          doc.data().fighter1 === f.name || doc.data().fighter2 === f.name
                        );
                        await Promise.all(fightsToDelete.map(docSnap =>
                          deleteDoc(doc(db, 'fights', docSnap.id))
                        ));
                        await fetchFighters();
                        await fetchFights();
                        await resyncFighterRecords();
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* 📂 Manage Fights */}
        <div>
          <h2 className="text-xl font-bold mb-2">📂 Manage Fights</h2>
          <input
            type="text"
            placeholder="Search fights..."
            value={searchFight}
            onChange={e => setSearchFight(e.target.value)}
            className="mb-2 px-3 py-1 rounded bg-gray-800 text-white w-full"
          />
          <div className="space-y-3">
            {fights
              .filter(f =>
                f.fighter1.toLowerCase().includes(searchFight.toLowerCase()) ||
                f.fighter2.toLowerCase().includes(searchFight.toLowerCase()) ||
                f.winner.toLowerCase().includes(searchFight.toLowerCase())
              )
              .map(fight => (
                <div key={fight.id} className="bg-gray-800 p-4 rounded shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="text-white">
                    <p><strong>{fight.fighter1}</strong> vs <strong>{fight.fighter2}</strong></p>
                    <p>🏆 Winner: <strong>{fight.winner}</strong> ({fight.method})</p>
                    <p>🕓 Date: {fight.date}</p>
                    <p>🎮 Platform: {fight.platform}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await deleteDoc(doc(db, 'fights', fight.id));
                      setFights(prev => prev.filter(f => f.id !== fight.id));
                      await resyncFighterRecords();
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                  >
                    Delete
                  </button>
                </div>
              ))}
          </div>
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
