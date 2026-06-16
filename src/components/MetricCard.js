import React from "react";

const MetricCard = ({ title, value, statusLabel, accentColor = "#6366f1" }) => {
  return (
    <div
      style={{
        padding: "24px",
        backgroundColor: "#1e293b", // Slate 800
        borderRadius: "16px",
        border: "1px solid #334155", // Slate 700
        boxShadow:
          "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.2)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Structural Neon Accent Bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          backgroundColor: accentColor,
        }}
      />

      <div
        style={{
          fontSize: "13px",
          color: "#94a3b8",
          textTransform: "uppercase",
          fontWeight: "600",
          letterSpacing: "0.05em",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "30px",
          fontWeight: "700",
          marginTop: "12px",
          color: "#f8fafc",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>

      {statusLabel && (
        <div
          style={{
            marginTop: "12px",
            fontSize: "12px",
            color: "#64748b",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: accentColor,
              display: "inline-block",
            }}
          ></span>
          {statusLabel}
        </div>
      )}
    </div>
  );
};

export default MetricCard;
