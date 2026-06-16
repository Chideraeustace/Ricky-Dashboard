/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "./firebase";

import MetricCard from "./components/MetricCard";
import FilterControls from "./components/FilterControls";
import AnalyticsTable from "./components/AnalyticsTable";

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [rickysData, setRickysData] = useState([]);
  const [acnData, setAcnData] = useState([]);

  const [allTimeTotals, setAllTimeTotals] = useState({
    sales: 0,
    profit: 0,
    orders: 0,
  });
  const [filterType, setFilterType] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [accumulatedTotals, setAccumulatedTotals] = useState({
    rickySales: 0,
    rickyProfit: 0,
    acnSales: 0,
    acnProfit: 0,
    combinedProfit: 0,
    orders: 0,
  });

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);

        const rickySnapshot = await getDocs(
          query(collection(db, "rickys_analytics")),
        );
        const rickyList = rickySnapshot.docs
          .map((doc) => ({
            date: doc.id,
            ...doc.data(),
          }))
          .sort((a, b) => b.date.localeCompare(a.date));

        const acnSnapshot = await getDocs(
          query(collection(db, "ACN_Analytics")),
        );
        const acnList = acnSnapshot.docs
          .map((doc) => ({
            date: doc.id,
            ...doc.data(),
          }))
          .sort((a, b) => b.date.localeCompare(a.date));

        setRickysData(rickyList);
        setAcnData(acnList);

        let totalSales = 0,
          totalProfit = 0,
          totalOrders = 0;
        rickyList.forEach((item) => {
          totalSales += Number(item.salestransaction || 0);
          totalProfit += Number(item.profit || 0);
          totalOrders += Number(item.ordercount || 0);
        });
        acnList.forEach((item) => {
          totalSales += Number(item.salestransaction || 0);
          totalProfit += Number(item.profit || 0);
          totalOrders += Number(item.ordercount || 0);
        });

        setAllTimeTotals({
          sales: totalSales,
          profit: totalProfit,
          orders: totalOrders,
        });
      } catch (error) {
        console.error("Error pulling analytics records:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  useEffect(() => {
    let startBoundary = "";
    let endBoundary = "";
    const today = new Date();

    const formatKeyDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    if (filterType === "week") {
      const currentDay = today.getDay();
      const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - distanceToMonday);
      startBoundary = formatKeyDate(monday);
      endBoundary = formatKeyDate(today);
    } else if (filterType === "month") {
      startBoundary = formatKeyDate(
        new Date(today.getFullYear(), today.getMonth(), 1),
      );
      endBoundary = formatKeyDate(today);
    } else if (filterType === "lastMonth") {
      startBoundary = formatKeyDate(
        new Date(today.getFullYear(), today.getMonth() - 1, 1),
      );
      endBoundary = formatKeyDate(
        new Date(today.getFullYear(), today.getMonth(), 0),
      );
    } else if (filterType === "custom") {
      startBoundary = startDate;
      endBoundary = endDate || formatKeyDate(today);
    }

    let rSales = 0,
      rProfit = 0,
      aSales = 0,
      aProfit = 0,
      filteredOrders = 0;
    const isWithinBounds = (dateStr) => {
      if (filterType === "all") return true;
      if (!startBoundary) return true;
      return dateStr >= startBoundary && dateStr <= endBoundary;
    };

    rickysData.forEach((item) => {
      if (isWithinBounds(item.date)) {
        rSales += Number(item.salestransaction || 0);
        rProfit += Number(item.profit || 0);
        filteredOrders += Number(item.ordercount || 0);
      }
    });
    acnData.forEach((item) => {
      if (isWithinBounds(item.date)) {
        aSales += Number(item.salestransaction || 0);
        aProfit += Number(item.profit || 0);
        filteredOrders += Number(item.ordercount || 0);
      }
    });

    setAccumulatedTotals({
      rickySales: rSales,
      rickyProfit: rProfit,
      acnSales: aSales,
      acnProfit: aProfit,
      combinedProfit: rProfit + aProfit,
      orders: filteredOrders,
    });
  }, [filterType, startDate, endDate, rickysData, acnData]);

  const allDates = Array.from(
    new Set([...rickysData.map((d) => d.date), ...acnData.map((d) => d.date)]),
  ).sort((a, b) => b.localeCompare(a));

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0f172a",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "3px solid #334155",
              borderTopColor: "#6366f1",
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 1s linear infinite",
            }}
          ></div>
          <h4
            style={{ marginTop: "16px", color: "#94a3b8", fontWeight: "500" }}
          >
            Synchronizing Ledger Arrays...
          </h4>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "40px 24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        backgroundColor: "#0f172a",
        color: "#f8fafc",
        minHeight: "100vh",
      }}
    >
      {/* HEADER SECTION */}
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "28px",
            fontWeight: "800",
            color: "#ffffff",
            letterSpacing: "-0.02em",
          }}
        >
          Executive Operations Summary
        </h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "14px", color: "#94a3b8" }}>
          Real-time cross-platform metrics overview
        </p>
      </div>

      {/* --- ALL TIME MASTER GRAND TOTALS --- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "20px",
          marginBottom: "40px",
        }}
      >
        <MetricCard
          title="All-Time Gross Volume"
          value={`₵${allTimeTotals.sales.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          statusLabel="Combined Revenue Pipeline"
          accentColor="#3b82f6"
        />
        <MetricCard
          title="All-Time Cumulative Profit"
          value={`₵${allTimeTotals.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          statusLabel="Net Operational Yield"
          accentColor="#34d399"
        />
        <MetricCard
          title="Total System Orders"
          value={`${allTimeTotals.orders.toLocaleString()} Vol`}
          statusLabel="Processed Transaction Instances"
          accentColor="#f59e0b"
        />
      </div>

      {/* --- DATE ACCUMULATION CONTROLS ENGINE --- */}
      <div
        style={{
          backgroundColor: "#1e293b",
          borderRadius: "16px",
          padding: "24px",
          marginBottom: "40px",
          border: "1px solid #334155",
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: "16px",
            fontSize: "16px",
            fontWeight: "700",
            color: "#f8fafc",
          }}
        >
          Accumulated Profit Windows
        </h3>

        <FilterControls
          filterType={filterType}
          setFilterType={setFilterType}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
        />

        {/* ACCUMULATED RANGE RESULTS CONTAINER */}
        <div
          style={{
            backgroundColor: "#0f172a",
            borderRadius: "12px",
            padding: "20px",
            border: "1px solid #334155",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: "700",
              color: "#94a3b8",
              marginBottom: "16px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Interval Performance Window Evaluation
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "24px",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "13px",
                  color: "#94a3b8",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Ricky's Profit (Filtered)
              </span>
              <strong
                style={{
                  fontSize: "20px",
                  color: "#f8fafc",
                  fontWeight: "700",
                }}
              >
                ₵{accumulatedTotals.rickyProfit.toFixed(2)}
              </strong>
            </div>
            <div>
              <span
                style={{
                  fontSize: "13px",
                  color: "#94a3b8",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                ACN Profit (Filtered)
              </span>
              <strong
                style={{
                  fontSize: "20px",
                  color: "#f8fafc",
                  fontWeight: "700",
                }}
              >
                ₵{accumulatedTotals.acnProfit.toFixed(2)}
              </strong>
            </div>
            <div
              style={{ borderLeft: "2px solid #334155", paddingLeft: "24px" }}
            >
              <span
                style={{
                  fontSize: "13px",
                  color: "#34d399",
                  display: "block",
                  fontWeight: "600",
                  marginBottom: "4px",
                }}
              >
                Total Window Profit
              </span>
              <strong
                style={{
                  fontSize: "26px",
                  color: "#34d399",
                  fontWeight: "800",
                  letterSpacing: "-0.02em",
                }}
              >
                ₵{accumulatedTotals.combinedProfit.toFixed(2)}
              </strong>
            </div>
            <div>
              <span
                style={{
                  fontSize: "13px",
                  color: "#94a3b8",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Orders in Period
              </span>
              <strong
                style={{
                  fontSize: "20px",
                  color: "#f8fafc",
                  fontWeight: "700",
                }}
              >
                {accumulatedTotals.orders}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* --- SEPARATED METRICS TIMELINE BREAKDOWN --- */}
      <AnalyticsTable
        allDates={allDates}
        rickysData={rickysData}
        acnData={acnData}
      />

      {/* Loader Keyframes */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
