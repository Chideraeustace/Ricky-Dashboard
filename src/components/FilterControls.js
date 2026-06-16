import React, { useState, useEffect } from "react";

const FilterControls = ({
  filterType,
  setFilterType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}) => {
  const buttons = [
    { id: "all", label: "All" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
    { id: "lastMonth", label: "Last Month" },
    { id: "custom", label: "Custom" },
  ];

  // Track window width dynamically for structural adjustments
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 640);
    };

    // Initial check
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: "16px",
        alignItems: isMobile ? "stretch" : "center",
        marginBottom: "24px",
        width: "100%",
      }}
    >
      {/* Tab Segment Controller */}
      <div
        style={{
          display: "flex",
          backgroundColor: "#0f172a",
          padding: "4px",
          borderRadius: "12px",
          gap: "2px",
          border: "1px solid #334155",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none", // Hide default scrollbar on Firefox
          width: "100%",
        }}
      >
        {buttons.map((btn) => {
          const isActive = filterType === btn.id;
          return (
            <button
              key={btn.id}
              onClick={() => setFilterType(btn.id)}
              style={{
                padding: isMobile ? "10px 12px" : "8px 16px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                backgroundColor: isActive ? "#334155" : "transparent",
                color: isActive ? "#f8fafc" : "#94a3b8",
                fontWeight: "600",
                fontSize: isMobile ? "13px" : "14px",
                transition: "all 0.15s ease",
                flex: isMobile ? "1 0 auto" : "unset", // Allow even horizontal scaling on small panels
                textAlign: "center",
                whiteSpace: "nowrap",
              }}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* Conditional Custom Date Inputs Container */}
      {filterType === "custom" && (
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "row" : "row",
            gap: "8px",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            animation: "fadeIn 0.25s ease",
          }}
        >
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              fontSize: "14px",
              color: "#f8fafc",
              colorScheme: "dark",
              outline: "none",
              flex: 1,
              width: "100%",
            }}
          />

          <span
            style={{
              color: "#64748b",
              fontSize: "14px",
              fontWeight: "600",
              padding: "0 4px",
            }}
          >
            to
          </span>

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              fontSize: "14px",
              color: "#f8fafc",
              colorScheme: "dark",
              outline: "none",
              flex: 1,
              width: "100%",
            }}
          />
        </div>
      )}

      {/* Embedded Fade animation styling block */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        /* Custom styling setup to remove horizontal browser scroll tracks */
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default FilterControls;
