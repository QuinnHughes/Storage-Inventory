import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import "./Layout.css";

const nav = [
  { to: "/",          label: "Dashboard" },
  { to: "/analytics", label: "Analytics" },
  { to: "/morgan",    label: "Morgan Inventory" },
  { to: "/storage",   label: "Storage Inventory" },
  { to: "/mapping",   label: "Mapping" },
  { to: "/accessioning", label: "Accessioning" },
  { to: "/settings",  label: "Settings" },
];

export default function Layout() {
  const [dbOk, setDbOk] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.health()
      .then((r) => {
        setDbOk(r.db);
        if (!r.db) navigate("/settings", { replace: true });
      })
      .catch(() => {
        setDbOk(false);
        navigate("/settings", { replace: true });
      });
  }, []);

  return (
    <div className="layout">
      <nav className="sidebar">
        <h2>Quinn's Tool For a Presentable Library</h2>
        <div className="sidebar-subtitle">Shelf Audit Tool</div>
        <h3>Navigation</h3>
        <ul>
          {nav.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === "/"}
                className={({ isActive }) => isActive ? "active" : ""}
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className={`db-status ${dbOk === true ? "ok" : dbOk === false ? "err" : ""}`}>
          {dbOk === true  && "● DB connected"}
          {dbOk === false && "⚠ DB not connected"}
        </div>
      </nav>
      <main className="main-content">
        <div className="px-10 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

