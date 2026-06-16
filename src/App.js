import React from "react";
import Dashboard from "./Dashboard";
import "./App.css";

function App() {
  return (
    <div className="App">
      {/* Removed the centering App-header wrapper to let the dashboard stretch naturally */}
      <Dashboard />
    </div>
  );
}

export default App;
