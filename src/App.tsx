import { useState, useEffect } from 'react';
import Login from './components/Login';
import TodoList from './components/TodoList';

export default function App() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('todo-token');
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  const handleLogin = (newToken: string) => {
    localStorage.setItem('todo-token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('todo-token');
    setToken(null);
  };

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  return <TodoList token={token} onLogout={handleLogout} />;
}
