// app/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
// Replace Supabase with Firebase setup
import { db } from '@/firebase/config';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';

const platforms = ['UFL PC', 'UFL PS5', 'UFL XBOX'] as const;
type Platform = typeof platforms[number];

type Fighter = {
  name: string;
  platform: Platform;
  wins: number;
  losses: number;
  draws: number;
  koWins: number;
  previousRank: number;
};

type Fight = {
  fighter1: string;
  fighter2: string;
  winner: string;
  method: 'KO' | 'Decision' | 'Draw';
  platform: Platform;
  date: string;
};

export default function Home() {
  const [tab, setTab] = useState<'Records' | Platform | 'Fights' | 'Admin'>('Records');
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [fights, setFights] = useState<Fight[]>([]);
  const [champions, setChampions] = useState<Record<Platform, string>>({
    'UFL PC': '',
    'UFL PS5': '',
    'UFL XBOX': '',
  });
  const [admin, setAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [search, setSearch] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

 const refreshData = async () => {
  try {
    const fightersSnapshot = await getDocs(collection(db, 'fighters'));
    const fightsSnapshot = await getDocs(collection(db, 'fights'));
    const championsSnapshot = await getDocs(collection(db, 'champions'));

    const fightersData = fightersSnapshot.docs.map(doc => doc.data() as Fighter);
    const fightsData = fightsSnapshot.docs.map(doc => doc.data() as Fight);
    const champsData = championsSnapshot.docs.map(doc => doc.data() as { platform: Platform; name: string });

    setFighters(fightersData);
    setFights(fightsData);

    const formattedChamps: Record<Platform, string> = {
      'UFL PC': '',
      'UFL PS5': '',
      'UFL XBOX': '',
    };
    champsData.forEach(c => {
      formattedChamps[c.platform as Platform] = c.name;
    });
    setChampions(formattedChamps);
  } catch (err) {
    console.error('Firebase load failed, falling back to localStorage:', err);
    const savedFighters = localStorage.getItem('fighters');
    const savedFights = localStorage.getItem('fights');
    const savedChampions = localStorage.getItem('champions');
    if (savedFighters) setFighters(JSON.parse(savedFighters));
    if (savedFights) setFights(JSON.parse(savedFights));
    if (savedChampions) setChampions(JSON.parse(savedChampions));
  }
};

useEffect(() => {
  refreshData();
}, []);

  useEffect(() => {
    localStorage.setItem('fighters', JSON.stringify(fighters));
    localStorage.setItem('fights', JSON.stringify(fights));
    localStorage.setItem('champions', JSON.stringify(champions));
  }, [fighters, fights, champions]);
  
const addFighter = async (name: string, platform: Platform) => {
  if (fighters.find(f => f.name === name && f.platform === platform)) {
    return alert('Fighter already exists on this platform.');
  }

  const newFighter: Fighter = {
    name,
    platform,
    wins: 0,
    losses: 0,
    draws: 0,
    koWins: 0,
    previousRank: 0,
  };

  try {
    await setDoc(doc(db, 'fighters', `${name}-${platform}`), newFighter);
    setFighters([...fighters, newFighter]);
    await refreshData();
  } catch (err) {
    console.error('Insert error:', err);
  }
};

const addFight = async (fight: Fight) => {
  const updatedFighters = fighters.map(f => {
    if (f.name === fight.fighter1 || f.name === fight.fighter2) {
      const isWinner = f.name === fight.winner;
      const isDraw = fight.winner === 'Draw';
      return {
        ...f,
        wins: f.wins + (isWinner ? 1 : 0),
        losses: f.losses + (!isWinner && !isDraw ? 1 : 0),
        draws: f.draws + (isDraw ? 1 : 0),
        koWins: f.koWins + (isWinner && fight.method === 'KO' ? 1 : 0),
      };
    }
    return f;
  });

  try {
    await addDoc(collection(db, 'fights'), fight);
    for (const f of updatedFighters) {
      await setDoc(doc(db, 'fighters', `${f.name}-${f.platform}`), f);
    }

    const newFights = [...fights, fight];
    setFights(newFights);
    await recalculateRecords(newFights); // ✅ accurate and recalculated
    await refreshData(); // ✅ pull synced data
  } catch (err) {
    console.error('Add fight error:', err);
  }
};

const deleteFight = async (index: number) => {
  const fight = fights[index];
  const remainingFights = fights.filter((_, i) => i !== index);
  setFights(remainingFights);
  recalculateRecords(remainingFights);
  const updatedFighters = fighters.map(f => {
  const relevantFights = remainingFights.filter(
    fight => (fight.fighter1 === f.name || fight.fighter2 === f.name) && fight.platform === f.platform
  );

  let wins = 0,
    losses = 0,
    draws = 0,
    koWins = 0;

  relevantFights.forEach(fight => {
    const isWinner = fight.winner === f.name;
    const isDraw = fight.winner === 'Draw';
    const isLoser = !isWinner && !isDraw && (fight.fighter1 === f.name || fight.fighter2 === f.name);

    if (isWinner) {
      wins++;
      if (fight.method === 'KO') koWins++;
    } else if (isLoser) {
      losses++;
    } else if (isDraw) {
      draws++;
    }
  });

  return { ...f, wins, losses, draws, koWins };
});

// Update Firebase with recalculated records
for (const f of updatedFighters) {
  await setDoc(doc(db, 'fighters', `${f.name}-${f.platform}`), f);
}

setFighters(updatedFighters);

  try {
    const allFightsSnapshot = await getDocs(collection(db, 'fights'));
    const matchingDoc = allFightsSnapshot.docs.find(
      d => {
        const data = d.data();
        return (
          data.fighter1 === fight.fighter1 &&
          data.fighter2 === fight.fighter2 &&
          data.date === fight.date &&
          data.platform === fight.platform
        );
      }
    );

    if (matchingDoc) {
      await deleteDoc(doc(db, 'fights', matchingDoc.id));
    }

    await refreshData();
  } catch (err) {
    console.error('Delete fight error:', err);
  }
};

 const editFighterName = async (oldName: string, newName: string) => {
  if (!newName || fighters.some(f => f.name === newName)) {
    return alert("Invalid or duplicate name.");
  }

  const fighter = fighters.find(f => f.name === oldName);
  if (!fighter) return;

  const updatedFighter = { ...fighter, name: newName };

  try {
    await deleteDoc(doc(db, 'fighters', `${oldName}-${fighter.platform}`));
    await setDoc(doc(db, 'fighters', `${newName}-${fighter.platform}`), updatedFighter);

    const updatedFights = fights.map(f => ({
      ...f,
      fighter1: f.fighter1 === oldName ? newName : f.fighter1,
      fighter2: f.fighter2 === oldName ? newName : f.fighter2,
      winner: f.winner === oldName ? newName : f.winner
    }));

    const allFightsSnapshot = await getDocs(collection(db, 'fights'));
    for (const docSnap of allFightsSnapshot.docs) {
      const data = docSnap.data();
      const isInvolved = [data.fighter1, data.fighter2, data.winner].includes(oldName);
      if (isInvolved) {
        const updated = {
          ...data,
          fighter1: data.fighter1 === oldName ? newName : data.fighter1,
          fighter2: data.fighter2 === oldName ? newName : data.fighter2,
          winner: data.winner === oldName ? newName : data.winner,
        };
        await setDoc(doc(db, 'fights', docSnap.id), updated);
      }
    }

    setFights(updatedFights);
    await recalculateRecords(updatedFights);

    const updatedChamps = { ...champions };
    for (const p of platforms) {
      if (updatedChamps[p] === oldName) updatedChamps[p] = newName;
    }
    setChampions(updatedChamps);
  } catch (err) {
    console.error('Edit name error:', err);
  }
};

const setChampion = async (platform: Platform, name: string) => {
  const updatedChamps = { ...champions, [platform]: name };
  setChampions(updatedChamps);

  try {
    await setDoc(doc(db, 'champions', platform), {
      platform,
      name,
    });
  } catch (err) {
    console.error('Champion update error:', err);
  }
};

  const deleteFighter = async (name: string) => {
  const fighter = fighters.find(f => f.name === name);
  if (!fighter) return;

  try {
    await deleteDoc(doc(db, 'fighters', `${fighter.name}-${fighter.platform}`));
    const updatedFighters = fighters.filter(f => f.name !== name);
    setFighters(updatedFighters);

    // Delete related fights
    const remainingFights = fights.filter(
      fight => fight.fighter1 !== name && fight.fighter2 !== name
    );
    setFights(remainingFights);
    await recalculateRecords(remainingFights);

    const allFightsSnapshot = await getDocs(collection(db, 'fights'));
    for (const docSnap of allFightsSnapshot.docs) {
      const data = docSnap.data();
      if (data.fighter1 === name || data.fighter2 === name) {
        await deleteDoc(doc(db, 'fights', docSnap.id));
      }
    }

    const updatedChamps = { ...champions };
    for (const platform of platforms) {
      if (updatedChamps[platform] === name) {
        updatedChamps[platform] = '';
        await setDoc(doc(db, 'champions', platform), { platform, name: '' });
      }
    }
    setChampions(updatedChamps);
  } catch (err) {
    console.error('Delete fighter error:', err);
  }
};

  const rankedFighters = (platform: Platform) => {
  const now = new Date();

  const platformFighters = fighters.filter(
    f => f.platform === platform && f.name !== champions[platform]
  );

  const scoredFighters = platformFighters.map(f => {
    // Get all fights involving this fighter on this platform
    const relevantFights = fights.filter(
      fight =>
        fight.platform === platform &&
        (fight.fighter1 === f.name || fight.fighter2 === f.name)
    );

    // Quality of opponents beaten
    const quality = relevantFights.reduce((acc, fight) => {
      if (fight.winner === f.name) {
        const opponentName = fight.fighter1 === f.name ? fight.fighter2 : fight.fighter1;
        const opponent = fighters.find(o => o.name === opponentName && o.platform === platform);
        return acc + (opponent ? opponent.wins : 0);
      }
      return acc;
    }, 0);

    // Recency bonus (only for wins in last 20 days)
    const recencyBonus = relevantFights.reduce((acc, fight) => {
      if (fight.winner === f.name) {
        const fightDate = new Date(fight.date);
        const daysAgo = (now.getTime() - fightDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo <= 20) {
          acc += 2; // Boost for recent activity
        }
      }
      return acc;
    }, 0);

    const score = f.wins * 5 + quality - f.losses * 2 + recencyBonus;

    return { ...f, score };
  });

  // Sort by score descending
  scoredFighters.sort((a, b) => b.score - a.score);

  // Apply head-to-head override (bump a fighter above someone they beat recently)
  for (let i = 0; i < scoredFighters.length; i++) {
    const fighterA = scoredFighters[i];
    for (let j = i + 1; j < scoredFighters.length; j++) {
      const fighterB = scoredFighters[j];

      const recentFight = fights.find(fight => {
        const involved = 
          (fight.fighter1 === fighterA.name && fight.fighter2 === fighterB.name) ||
          (fight.fighter2 === fighterA.name && fight.fighter1 === fighterB.name);
        const recent = (new Date().getTime() - new Date(fight.date).getTime()) / (1000 * 60 * 60 * 24) <= 20;
        return involved && recent && fight.winner === fighterA.name && fight.platform === platform;
      });

      if (recentFight) {
        // Move Fighter A above Fighter B
        scoredFighters.splice(j, 1);
        scoredFighters.splice(i, 0, fighterB);
        // Rerun from start due to mutation
        return scoredFighters.slice(0, 10);
      }
    }
  }

  return scoredFighters.slice(0, 10);
};
  
const recalculateRecords = async (
  fightsToUse: Fight[],
  fighterList: Fighter[] = fighters
) => {
  const updatedFighters = fighterList.map(f => {
    const relevantFights = fightsToUse.filter(
      fight =>
        (fight.fighter1 === f.name || fight.fighter2 === f.name) &&
        fight.platform === f.platform
    );

    let wins = 0,
      losses = 0,
      draws = 0,
      koWins = 0;

    relevantFights.forEach(fight => {
      const isWinner = fight.winner === f.name;
      const isDraw = fight.winner === 'Draw';
      const isLoser =
        !isWinner &&
        !isDraw &&
        (fight.fighter1 === f.name || fight.fighter2 === f.name);

      if (isWinner) {
        wins++;
        if (fight.method === 'KO') koWins++;
      } else if (isLoser) {
        losses++;
      } else if (isDraw) {
        draws++;
      }
    });

    return { ...f, wins, losses, draws, koWins };
  });

  setFighters(updatedFighters);

  // ✅ Save updated records to Firebase
  for (const f of updatedFighters) {
    await setDoc(doc(db, 'fighters', `${f.name}-${f.platform}`), f);
  }
};

  return (
    <main className="p-4 text-white bg-gradient-to-br from-gray-900 to-black min-h-screen">
      <h1 className="text-4xl font-bold text-center text-cyan-400 mb-6">UFL WORLD RANKINGS</h1>
      <nav className="flex flex-wrap justify-center gap-4 mb-6">
        {['Records', ...platforms, 'Fights', 'Admin'].map(t => (
          <button key={t} onClick={() => setTab(t as any)} className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700">
            {t}
          </button>
        ))}
      </nav>

      {/* Admin Panel */}
      {tab === 'Admin' && (
        <div>
          {!admin ? (
            <div>
              <input
                className="p-2 bg-gray-800 border border-gray-600"
                placeholder="Enter Admin Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                onClick={() => setAdmin(password === 'G36DSFGB3873GFDIY38HS9I34G')}
                className="ml-2 px-4 py-2 bg-green-600 rounded"
              >Login</button>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold">Add Fighter</h2>
                <input placeholder="Name" id="name" className="p-2 bg-gray-800 border" />
                <select id="platform" className="ml-2 p-2 bg-gray-800 border">
                  {platforms.map(p => <option key={p}>{p}</option>)}
                </select>
                <button
                  className="ml-2 px-4 py-2 bg-blue-600 rounded"
                  onClick={() => {
                    const nameInput = document.getElementById('name') as HTMLInputElement;
                    const platformSelect = document.getElementById('platform') as HTMLSelectElement;
                    addFighter(nameInput.value, platformSelect.value as Platform);
                  }}
                >Add</button>
                <div>
  <h2 className="text-xl font-bold">Add Fight</h2>
  <select id="fighter1" className="p-2 bg-gray-800 border mr-2">
    {fighters.map(f => <option key={f.name}>{f.name}</option>)}
  </select>
  <select id="fighter2" className="p-2 bg-gray-800 border mr-2">
    {fighters.map(f => <option key={f.name}>{f.name}</option>)}
  </select>
  <select id="winner" className="p-2 bg-gray-800 border mr-2">
    <option>Draw</option>
    {fighters.map(f => <option key={f.name}>{f.name}</option>)}
  </select>
  <select id="method" className="p-2 bg-gray-800 border mr-2">
    <option>KO</option>
    <option>Decision</option>
    <option>Draw</option>
  </select>
  <select id="platformFight" className="p-2 bg-gray-800 border mr-2">
    {platforms.map(p => <option key={p}>{p}</option>)}
  </select>
  <input id="date" type="date" className="p-2 bg-gray-800 border mr-2" />
  <button
    className="px-4 py-2 bg-green-600 rounded"
    onClick={() => {
      const fighter1 = (document.getElementById('fighter1') as HTMLSelectElement).value;
      const fighter2 = (document.getElementById('fighter2') as HTMLSelectElement).value;
      const winner = (document.getElementById('winner') as HTMLSelectElement).value;
      const method = (document.getElementById('method') as HTMLSelectElement).value as 'KO' | 'Decision' | 'Draw';
      const platform = (document.getElementById('platformFight') as HTMLSelectElement).value as Platform;
      const date = (document.getElementById('date') as HTMLInputElement).value;

      if (!fighter1 || !fighter2 || !method || !platform || !date) {
        return alert('Please fill out all fields.');
      }
      if (fighter1 === fighter2) {
        return alert('Fighter cannot fight themselves.');
      }

      addFight({ fighter1, fighter2, winner, method, platform, date });
    }}
  >
    Add Fight
  </button>
</div>
              </div>
              <div>
                <h2 className="text-xl font-bold">Set Champion</h2>
                {platforms.map(p => (
                  <div key={p} className="mb-2">
                    <span>{p}: </span>
                    <select
                      onChange={e => setChampion(p, e.target.value)}
                      value={champions[p] || ''}
                      className="p-2 bg-gray-800 border"
                    >
                      <option value="">None</option>
                      {fighters.filter(f => f.platform === p).map(f => (
                        <option key={f.name}>{f.name}</option>
                      ))}
                    </select>
                  </div>
              
                ))}
              </div>
              <div>
                <div className="mt-6">
  <h2 className="text-xl font-bold">Edit Fighter Name</h2>
  <select id="editFighterOld" className="p-2 bg-gray-800 border mr-2">
    {fighters.map(f => (
      <option key={f.name}>{f.name}</option>
    ))}
  </select>
  <input
    id="editFighterNew"
    placeholder="New Name"
    className="p-2 bg-gray-800 border mr-2"
  />
  <button
    className="px-4 py-2 bg-yellow-600 rounded"
    onClick={() => {
      const oldName = (document.getElementById('editFighterOld') as HTMLSelectElement).value;
      const newName = (document.getElementById('editFighterNew') as HTMLInputElement).value;
      editFighterName(oldName, newName);
    }}
  >
    Edit Name
  </button>
</div>
                <h2 className="text-xl font-bold">Delete Fighter</h2>
                <select id="deleteFighter" className="p-2 bg-gray-800 border">
                  {fighters.map(f => (
                    <option key={f.name} value={f.name}>{f.name}</option>
                  ))}
                </select>
                <button
                  className="ml-2 px-4 py-2 bg-red-600 rounded"
                  onClick={() => {
                    const selected = (document.getElementById('deleteFighter') as HTMLSelectElement).value;
                    if (window.confirm(`Are you sure you want to delete ${selected}?`)) {
                      deleteFighter(selected);
                    }
                  }}
                >Delete</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Existing Tabs */}
      {tab === 'Records' && (
        <div>
          <input
            className="mb-4 p-2 bg-gray-800 border border-gray-600"
            placeholder="Search Fighters..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {fighters.filter(f => f.name.toLowerCase().includes(search.toLowerCase())).map(f => (
              <div key={f.name} className="bg-gray-800 p-4 rounded-xl shadow">
                <h2 className="text-xl font-bold text-cyan-400">{f.name}</h2>
                <p>Platform: {f.platform}</p>
                <p>Wins: {f.wins}</p>
                <p>Losses: {f.losses}</p>
                <p>Draws: {f.draws}</p>
                <p>KO %: {f.wins > 0 ? ((f.koWins / f.wins) * 100).toFixed(1) : 0}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {platforms.includes(tab as Platform) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="col-span-full text-2xl font-bold mb-2">
            Champion: 🏆 {champions[tab as Platform] || 'None'}
          </div>
          {rankedFighters(tab as Platform).map((f, i) => (
            <div key={f.name} className="bg-gray-800 p-4 rounded-xl shadow">
              <h2 className="text-xl font-bold">#{i + 1} {f.name}</h2>
              <p>Wins: {f.wins}</p>
              <p>Losses: {f.losses}</p>
              <p>Draws: {f.draws}</p>
              <p>KO %: {f.wins > 0 ? ((f.koWins / f.wins) * 100).toFixed(1) : 0}%</p>
            </div>
          ))}
        </div>
      )}

     {tab === 'Fights' && (
  <div>
    <input
      className="mb-4 p-2 bg-gray-800 border border-gray-600"
      placeholder="Search Fights..."
      value={search}
      onChange={e => setSearch(e.target.value)}
    />
    <div className="space-y-4">
      {fights
        .filter(fight =>
          fight.fighter1.toLowerCase().includes(search.toLowerCase()) ||
          fight.fighter2.toLowerCase().includes(search.toLowerCase())
        )
        .map((fight, i) => (
          <div key={i} className="bg-gray-800 p-4 rounded-xl shadow">
            <p>{fight.fighter1} vs {fight.fighter2}</p>
            <p>Winner: {fight.winner}</p>
            <p>Method: {fight.method}</p>
            <p>Platform: {fight.platform}</p>
            <p>Date: {fight.date}</p>
            {admin && (
  <>
    <button
      className="mt-2 mr-2 px-3 py-1 bg-yellow-600 rounded text-sm"
      onClick={() => {
        (async () => {
          const newWinner = prompt('Edit Winner:', fight.winner);
          const newMethod = prompt('Edit Method (KO, Decision, Draw):', fight.method);
          const newDate = prompt('Edit Date (YYYY-MM-DD):', fight.date);

          if (!newWinner || !newMethod || !newDate) return;

          const updatedFights = [...fights];
          updatedFights[i] = {
            ...fight,
            winner: newWinner,
            method: newMethod as 'KO' | 'Decision' | 'Draw',
            date: newDate,
          };
          setFights(updatedFights);
          await recalculateRecords(updatedFights);

          const allFightsSnapshot = await getDocs(collection(db, 'fights'));
          const fightDoc = allFightsSnapshot.docs.find(d => {
            const data = d.data();
            return (
              data.fighter1 === fight.fighter1 &&
              data.fighter2 === fight.fighter2 &&
              data.date === fight.date &&
              data.platform === fight.platform
            );
          });

          if (fightDoc) {
            await updateDoc(doc(db, 'fights', fightDoc.id), {
              winner: newWinner,
              method: newMethod,
              date: newDate,
            });
          }
        })();
      }}
    >
      Edit
    </button>
    <button
      className="mt-2 px-3 py-1 bg-red-600 rounded text-sm"
      onClick={() => {
        if (confirm('Are you sure you want to delete this fight?')) {
          deleteFight(i);
        }
      }}
    >
      Delete
    </button>
  </>
)}
          </div>
        ))}
    </div>
  </div>
)}

    </main>
  );}
