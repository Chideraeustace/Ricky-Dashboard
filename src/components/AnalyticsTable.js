import React from "react";

const AnalyticsTable = ({ allDates, rickysData, acnData }) => {
  return (
    <div
      style={{
        backgroundColor: "#1e293b",
        borderRadius: "16px",
        padding: "24px",
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
        border: "1px solid #334155",
        overflowX: "auto",
      }}
    >
      <div style={{ marginBottom: "20px" }}>
        <h3
          style={{
            margin: 0,
            fontSize: "18px",
            fontWeight: "700",
            color: "#f8fafc",
          }}
        >
          Daily Logs Ledger
        </h3>
        <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#94a3b8" }}>
          Cross-platform performance audit broken down by daily database
          entries.
        </p>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: "0",
          minWidth: "900px",
          fontSize: "14px",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#0f172a" }}>
            <th
              style={{
                padding: "14px 16px",
                textAlign: "left",
                color: "#cbd5e1",
                fontWeight: "600",
                borderBottom: "1px solid #334155",
                borderRadius: "8px 0 0 8px",
              }}
            >
              Date
            </th>
            <th
              style={{
                padding: "14px 16px",
                textAlign: "left",
                color: "#60a5fa",
                fontWeight: "600",
                borderBottom: "1px solid #334155",
              }}
            >
              Ricky's Sales
            </th>
            <th
              style={{
                padding: "14px 16px",
                textAlign: "left",
                color: "#34d399",
                fontWeight: "600",
                borderBottom: "1px solid #334155",
              }}
            >
              Ricky's Profit
            </th>
            <th
              style={{
                padding: "14px 16px",
                textAlign: "left",
                color: "#818cf8",
                fontWeight: "600",
                borderBottom: "1px solid #334155",
              }}
            >
              ACN Hotspot Sales
            </th>
            <th
              style={{
                padding: "14px 16px",
                textAlign: "left",
                color: "#a78bfa",
                fontWeight: "600",
                borderBottom: "1px solid #334155",
              }}
            >
              ACN Profit
            </th>
            <th
              style={{
                padding: "14px 16px",
                textAlign: "right",
                color: "#f8fafc",
                fontWeight: "700",
                borderBottom: "1px solid #334155",
                borderRadius: "0 8px 8px 0",
              }}
            >
              Day Combined Profit
            </th>
          </tr>
        </thead>
        <tbody>
          {allDates.map((dateKey) => {
            const rDoc = rickysData.find((d) => d.date === dateKey) || {};
            const aDoc = acnData.find((d) => d.date === dateKey) || {};

            const rSales = Number(rDoc.salestransaction || 0);
            const rProfit = Number(rDoc.profit || 0);
            const aSales = Number(aDoc.salestransaction || 0);
            const aProfit = Number(aDoc.profit || 0);
            const combinedDayProfit = rProfit + aProfit;

            return (
              <tr key={dateKey}>
                <td
                  style={{
                    padding: "16px",
                    fontWeight: "600",
                    color: "#cbd5e1",
                    borderBottom: "1px solid #334155",
                  }}
                >
                  {dateKey}
                </td>
                <td
                  style={{
                    padding: "16px",
                    color: "#94a3b8",
                    borderBottom: "1px solid #334155",
                  }}
                >
                  {rSales > 0 ? `₵${rSales.toFixed(2)}` : "—"}
                </td>
                <td
                  style={{
                    padding: "16px",
                    color: "#34d399",
                    fontWeight: "500",
                    borderBottom: "1px solid #334155",
                  }}
                >
                  {rProfit > 0 ? `₵${rProfit.toFixed(2)}` : "—"}
                </td>
                <td
                  style={{
                    padding: "16px",
                    color: "#94a3b8",
                    borderBottom: "1px solid #334155",
                  }}
                >
                  {aSales > 0 ? `₵${aSales.toFixed(2)}` : "—"}
                </td>
                <td
                  style={{
                    padding: "16px",
                    color: "#a78bfa",
                    fontWeight: "500",
                    borderBottom: "1px solid #334155",
                  }}
                >
                  {aProfit > 0 ? `₵${aProfit.toFixed(2)}` : "—"}
                </td>
                <td
                  style={{
                    padding: "16px",
                    textAlign: "right",
                    fontWeight: "700",
                    color: "#f8fafc",
                    borderBottom: "1px solid #334155",
                    backgroundColor: "rgba(15, 23, 42, 0.3)",
                  }}
                >
                  ₵{combinedDayProfit.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default AnalyticsTable;
