import React from 'react';
import { NavLink } from 'react-router-dom';

export default function TopNav({ children }) {
  return (
    <nav className="topnav">
      <NavLink to="/" className="logo">
        <span className="mark" aria-hidden="true" />
        EATransform
      </NavLink>
      <NavLink to="/" className="navlink" end>
        Dashboard
      </NavLink>
      <NavLink to="/settings" className="navlink">
        Settings
      </NavLink>
      <div className="spacer" />
      {children}
    </nav>
  );
}
