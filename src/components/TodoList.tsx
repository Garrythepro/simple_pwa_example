import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useOfflineSync, initDB } from '../hooks/useOfflineSync';
import { Check, Trash2, Plus, Wifi, WifiOff, RefreshCw, LogOut } from 'lucide-react';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

export default function TodoList({ token, onLogout }: { token: string, onLogout: () => void }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch('/api/todos', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTodos(data);
        
        // Update local cache
        const db = await initDB();
        const tx = db.transaction('todos-cache', 'readwrite');
        await tx.objectStore('todos-cache').clear();
        for (const todo of data) {
          await tx.objectStore('todos-cache').put(todo);
        }
      }
    } catch (err) {
      // Load from local cache if offline
      const db = await initDB();
      const cached = await db.getAll('todos-cache');
      setTodos(cached);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const { isOnline, syncing, queueOperation } = useOfflineSync(token, fetchTodos);

  useEffect(() => {
    // Ensure cache store exists
    const setupCache = async () => {
      await initDB();
      fetchTodos();
    };
    
    setupCache();
  }, [fetchTodos]);

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;

    const todo: Todo = {
      id: uuidv4(),
      text: newTodo,
      completed: false
    };

    setTodos([todo, ...todos]);
    setNewTodo('');
    
    // Update cache
    const db = await initDB();
    await db.put('todos-cache', todo);

    await queueOperation('CREATE', todo);
  };

  const toggleTodo = async (id: string) => {
    const updatedTodos = todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    setTodos(updatedTodos);
    
    const todo = updatedTodos.find(t => t.id === id);
    if (todo) {
      const db = await initDB();
      await db.put('todos-cache', todo);
      await queueOperation('UPDATE', todo);
    }
  };

  const deleteTodo = async (id: string) => {
    setTodos(todos.filter(t => t.id !== id));
    
    const db = await initDB();
    await db.delete('todos-cache', id);
    
    await queueOperation('DELETE', { id });
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Tasks</h1>
          
          <div className="flex items-center gap-4">
            {syncing && (
              <div className="flex items-center gap-2 text-indigo-600 text-sm font-medium">
                <RefreshCw size={16} className="animate-spin" />
                Syncing...
              </div>
            )}
            <button 
              onClick={onLogout}
              className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 rounded-full transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
          <div className="p-6 border-b border-zinc-100">
            <form onSubmit={addTodo} className="flex gap-3">
              <input
                type="text"
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="What needs to be done?"
                className="flex-1 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
              <button
                type="submit"
                disabled={!newTodo.trim()}
                className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Plus size={20} />
                Add
              </button>
            </form>
          </div>

          <div className="divide-y divide-zinc-100">
            {loading ? (
              <div className="p-8 text-center text-zinc-500">Loading tasks...</div>
            ) : todos.length === 0 ? (
              <div className="p-12 text-center text-zinc-500">
                <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check size={24} className="text-zinc-400" />
                </div>
                <p className="text-lg font-medium text-zinc-900 mb-1">All caught up!</p>
                <p>You have no tasks remaining.</p>
              </div>
            ) : (
              todos.map(todo => (
                <div 
                  key={todo.id} 
                  className={`p-4 flex items-center gap-4 group hover:bg-zinc-50 transition-colors ${todo.completed ? 'opacity-60' : ''}`}
                >
                  <button
                    onClick={() => toggleTodo(todo.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${todo.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-300 text-transparent hover:border-indigo-500'}`}
                  >
                    <Check size={14} strokeWidth={3} />
                  </button>
                  
                  <span className={`flex-1 text-lg ${todo.completed ? 'line-through text-zinc-500' : 'text-zinc-900'}`}>
                    {todo.text}
                  </span>
                  
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="p-2 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
