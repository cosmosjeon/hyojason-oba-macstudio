import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import Home from './pages/Home';
import Play from './pages/Play';
import Board from './pages/Board';
import Mom from './pages/Mom';
import FamilySettings from './pages/FamilySettings';
import Family from './pages/Family';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/play" element={<Play />} />
      <Route path="/board" element={<Board />} />
      <Route path="/mom" element={<Mom />} />
      <Route path="/family/settings" element={<FamilySettings />} />
      <Route path="/family" element={<Family />} />
    </Routes>
  </BrowserRouter>,
);
