/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import * as XLSX from "xlsx";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

import WebsiteTransactionsTab from "./components/WebsiteTransactionsTab";
import UssdTransactionsTab from "./components/UssdTransactionsTab";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
const formatPhoneNumber = (number) => {
  if (!number) return "N/A";
  const cleaned = number.toString().replace(/^233/, "").trim();
  return cleaned.length === 9 ? `0${cleaned}` : cleaned || "N/A";
};

const extractGB = (desc) => {
  if (!desc) return "N/A";
  const m = desc.match(/(\d+)GB/i);
  return m ? m[1] : "N/A";
};

const downloadExcel = (data, fileName, headers) => {
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};

/* ------------------------------------------------------------------ */
/*  Dashboard component                                               */
/* ------------------------------------------------------------------ */
const Dashboard = () => {
  const [tabValue, setTabValue] = useState(0);

  const [transactions, setTransactions] = useState([]);
  const [ussdTransactions, setUssdTransactions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [transactionsPage, setTransactionsPage] = useState(1);
  const [ussdPage, setUssdPage] = useState(1);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [hasMoreUssd, setHasMoreUssd] = useState(true);

  // Revenue states
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [yesterdayRevenue, setYesterdayRevenue] = useState(0);
  const [yesterdayCount, setYesterdayCount] = useState(0);
  const [last7DaysRevenue, setLast7DaysRevenue] = useState(0);
  const [last7DaysCount, setLast7DaysCount] = useState(0);
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [customRevenue, setCustomRevenue] = useState(0);
  const [customCount, setCustomCount] = useState(0);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [recordCount, setRecordCount] = useState(0);

  const pageSize = 6;
  const maxExportRecords = 1000;
  const batchSize = 500;

  // Date helpers
  const now = new Date();
  const todayStart = new Date(now.setHours(0, 0, 0, 0));
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);

  const last7Start = new Date(todayStart);
  last7Start.setDate(last7Start.getDate() - 7);

  /* ----------------------- Tab handling ---------------------- */
  const handleTabChange = (newValue) => {
    setTabValue(newValue);
    setError(null);
  };

  /* -------------------------- Revenue Fetch ------------------- */
  const fetchRevenueStats = async () => {
    setLoading(true);
    try {
      // Today
      const todayQuery = query(
        collection(db, "rickyRevenue"),
        where("createdAt", ">=", todayStart),
        where("createdAt", "<", todayEnd),
      );
      const todaySnap = await getDocs(todayQuery);
      let todayTotal = 0;
      todaySnap.forEach((doc) => {
        todayTotal += Number(doc.data().amount || 0);
      });
      setTodayRevenue(todayTotal);
      setTodayCount(todaySnap.size);

      // Yesterday
      const yesterdayQuery = query(
        collection(db, "rickyRevenue"),
        where("createdAt", ">=", yesterdayStart),
        where("createdAt", "<", yesterdayEnd),
      );
      const yesterdaySnap = await getDocs(yesterdayQuery);
      let yesterdayTotal = 0;
      yesterdaySnap.forEach((doc) => {
        yesterdayTotal += Number(doc.data().amount || 0);
      });
      setYesterdayRevenue(yesterdayTotal);
      setYesterdayCount(yesterdaySnap.size);

      // Last 7 days
      const last7Query = query(
        collection(db, "rickyRevenue"),
        where("createdAt", ">=", last7Start),
        where("createdAt", "<", todayEnd),
      );
      const last7Snap = await getDocs(last7Query);
      let last7Total = 0;
      last7Snap.forEach((doc) => {
        last7Total += Number(doc.data().amount || 0);
      });
      setLast7DaysRevenue(last7Total);
      setLast7DaysCount(last7Snap.size);

      // Custom range
      if (customStartDate && customEndDate) {
        const customQuery = query(
          collection(db, "rickyRevenue"),
          where("createdAt", ">=", customStartDate),
          where("createdAt", "<=", customEndDate),
        );
        const customSnap = await getDocs(customQuery);
        let customTotal = 0;
        customSnap.forEach((doc) => {
          customTotal += Number(doc.data().amount || 0);
        });
        setCustomRevenue(customTotal);
        setCustomCount(customSnap.size);
      }
    } catch (e) {
      setError("Failed to load revenue data: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  /* -------------------------- Fetchers (Website & USSD) ------ */
  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "webite_purchase"),
        where("status", "==", "approved"),
        where("exported", "==", false),
      );
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTransactions(data);
      setHasMoreTransactions(data.length === pageSize);
    } catch (e) {
      setError("Failed to fetch transactions: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUssdTransactions = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "delivery_queue"),
        where("exported", "==", false),
      );
      const snap = await getDocs(q);

      const result = snap.docs.map((d) => {
        const row = d.data();
        return {
          id: d.id,
          beneficiary_msisdn:
            row.beneficiary_msisdn ||
            row.subscriber_number ||
            row.ussd_msisdn ||
            null,
          ussd_msisdn: row.ussd_msisdn || null,
          gig:
            row.gig || extractGBFromService(row.serviceName, row.desc) || "N/A",
          amount: row.amount || "N/A",
          transaction_id: row.transaction_id || "—",
          serviceName: row.serviceName || "—",
          createdAt: row.createdAt,
        };
      });

      const startIdx = (ussdPage - 1) * pageSize;
      const endIdx = startIdx + pageSize;
      const pageData = result.slice(startIdx, endIdx);

      setUssdTransactions(pageData);
      setHasMoreUssd(endIdx < result.length);
    } catch (e) {
      setError("Failed to fetch USSD transactions: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const extractGBFromService = (serviceName, desc) => {
    if (serviceName) {
      const match = serviceName.match(/(\d+(?:\.\d+)?)GB/i);
      if (match) return match[1] + "GB";
    }
    if (desc) {
      const match = desc.match(/(\d+(?:\.\d+)?)GB/i);
      if (match) return match[1] + "GB";
    }
    return null;
  };

  /* -------------------------- Export Handlers ----------------- */
  const handleDownloadTransactions = () => {
    openConfirmDialog(async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, "webite_purchase"),
          where("status", "==", "approved"),
          where("exported", "==", false),
        );
        const snap = await getDocs(q);
        const docs = snap.docs.slice(0, maxExportRecords);

        const data = docs.map((d) => ({
          Number: formatPhoneNumber(d.data().recipientNumber),
          GB: extractGB(d.data().serviceName) || "N/A",
        }));

        setRecordCount(docs.length);

        for (let i = 0; i < docs.length; i += batchSize) {
          const batch = writeBatch(db);
          docs
            .slice(i, i + batchSize)
            .forEach((d) => batch.update(d.ref, { exported: true }));
          await batch.commit();
        }

        downloadExcel(data, "Transactions", ["Number", "GB"]);
        await fetchTransactions();
      } catch (e) {
        setError("Export failed: " + e.message);
      } finally {
        setLoading(false);
      }
    });
  };

  const handleDownloadUssd = () => {
    openConfirmDialog(async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, "delivery_queue"),
          where("exported", "==", false),
        );
        const snap = await getDocs(q);
        const docs = snap.docs.slice(0, maxExportRecords);

        const data = docs.map((d) => {
          const row = d.data();
          const amount =
            typeof row.amount === "number" ? row.amount.toFixed(2) : "N/A";

          let gb = row.gig || "N/A";
          if (gb === "N/A") {
            if (row.serviceName) {
              const match = row.serviceName.match(/(\d+(?:\.\d+)?)GB/i);
              if (match) gb = match[1] + "GB";
            } else if (row.desc) {
              const match = row.desc.match(/(\d+(?:\.\d+)?)GB/i);
              if (match) gb = match[1] + "GB";
            }
          }

          return {
            Number: formatPhoneNumber(
              row.beneficiary_msisdn || row.subscriber_number,
            ),
            GB: gb,
            Amount: amount,
            Ref: row.transaction_id || "—",
            Network: row.r_switch || "—",
            Service: row.serviceName || row.desc || "—",
          };
        });

        setRecordCount(docs.length);

        for (let i = 0; i < docs.length; i += batchSize) {
          const batchDocs = docs.slice(i, i + batchSize);
          const batch = writeBatch(db);
          batchDocs.forEach((d) => batch.update(d.ref, { exported: true }));
          await batch.commit();
        }

        downloadExcel(
          data,
          "UssdTransactions_" + new Date().toISOString().slice(0, 10),
          ["Number", "GB", "Amount", "Ref", "Network", "Service"],
        );

        await fetchUssdTransactions();
      } catch (e) {
        setError("USSD export failed: " + e.message);
      } finally {
        setLoading(false);
      }
    });
  };

  /* -------------------------- Confirm Dialog ------------------ */
  const openConfirmDialog = (action) => {
    const run = async () => {
      try {
        setLoading(true);
        let count = 0;
        if (tabValue === 1) {
          const q = query(
            collection(db, "webite_purchase"),
            where("status", "==", "approved"),
            where("exported", "==", false),
          );
          const snap = await getDocs(q);
          count = snap.size;
        } else if (tabValue === 2) {
          const q = query(
            collection(db, "delivery_queue"),
            where("exported", "==", false),
          );
          const snap = await getDocs(q);
          count = snap.size;
        }
        setRecordCount(count);
        setConfirmAction(() => action);
        setShowConfirmDialog(true);
      } catch (e) {
        setError("Failed to count records: " + e.message);
      } finally {
        setLoading(false);
      }
    };
    run();
  };

  const closeConfirmDialog = () => {
    setShowConfirmDialog(false);
    setConfirmAction(null);
    setRecordCount(0);
  };

  const confirmDownload = () => {
    if (confirmAction) confirmAction();
    closeConfirmDialog();
  };

  /* -------------------------- Pagination ---------------------- */
  const handlePrevPage = () => {
    if (tabValue === 1 && transactionsPage > 1) {
      setTransactionsPage((p) => p - 1);
    } else if (tabValue === 2 && ussdPage > 1) {
      setUssdPage((p) => p - 1);
    }
  };

  const handleNextPage = () => {
    if (tabValue === 1 && hasMoreTransactions) {
      setTransactionsPage((p) => p + 1);
    } else if (tabValue === 2 && hasMoreUssd) {
      setUssdPage((p) => p + 1);
    }
  };

  /* -------------------------- Effects -------------------------- */
  useEffect(() => {
    if (tabValue === 0) {
      fetchRevenueStats();
    } else if (tabValue === 1) {
      fetchTransactions();
    } else if (tabValue === 2) {
      fetchUssdTransactions();
    }
  }, [tabValue, customStartDate, customEndDate]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  /* -------------------------- Render -------------------------- */
  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 min-h-screen bg-gray-100">
      {/* Confirm Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Confirm Export
            </h3>
            <p className="text-gray-600 mb-6">
              Export <strong>{recordCount}</strong>{" "}
              {tabValue === 1 ? "website transactions" : "USSD transactions"}?
              {recordCount >= maxExportRecords &&
                ` Only first ${maxExportRecords} will be processed.`}
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={closeConfirmDialog}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={confirmDownload}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-gray-300 bg-white rounded-lg shadow-sm mb-6">
        {["Revenue", "Website Transactions", "USSD Transactions"].map(
          (label, i) => (
            <button
              key={i}
              className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors duration-200 sm:text-base ${
                tabValue === i
                  ? "border-b-4 border-blue-600 text-blue-600 bg-blue-50"
                  : "text-gray-600 hover:text-blue-600 hover:bg-gray-50"
              }`}
              onClick={() => handleTabChange(i)}
            >
              {label}
            </button>
          ),
        )}
      </div>

      {/* Revenue Tab */}
      {tabValue === 0 && (
        <div className="mt-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            Revenue Overview
          </h2>

          {loading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
            </div>
          )}

          {error && (
            <p className="text-center text-red-600 font-medium mb-6">{error}</p>
          )}

          {!loading && !error && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">
                    Today
                  </h3>
                  <div className="text-3xl font-bold text-green-600">
                    GH₵ {todayRevenue.toFixed(2)}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {todayCount} transaction{todayCount !== 1 ? "s" : ""}
                  </p>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">
                    Yesterday
                  </h3>
                  <div className="text-3xl font-bold text-green-600">
                    GH₵ {yesterdayRevenue.toFixed(2)}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {yesterdayCount} transaction
                    {yesterdayCount !== 1 ? "s" : ""}
                  </p>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">
                    Last 7 Days
                  </h3>
                  <div className="text-3xl font-bold text-green-600">
                    GH₵ {last7DaysRevenue.toFixed(2)}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {last7DaysCount} transaction
                    {last7DaysCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              {/* Custom Date Range */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">
                  Custom Date Range
                </h3>
                <div className="flex flex-col sm:flex-row gap-4 items-end mb-6">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <DatePicker
                      selected={customStartDate}
                      onChange={(date) => setCustomStartDate(date)}
                      selectsStart
                      startDate={customStartDate}
                      endDate={customEndDate}
                      maxDate={new Date()}
                      dateFormat="yyyy-MM-dd"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholderText="Select start date"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End Date
                    </label>
                    <DatePicker
                      selected={customEndDate}
                      onChange={(date) => setCustomEndDate(date)}
                      selectsEnd
                      startDate={customStartDate}
                      endDate={customEndDate}
                      minDate={customStartDate}
                      maxDate={new Date()}
                      dateFormat="yyyy-MM-dd"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholderText="Select end date"
                    />
                  </div>
                  <button
                    onClick={fetchRevenueStats}
                    disabled={!customStartDate || !customEndDate}
                    className={`px-6 py-2 rounded-lg font-medium transition ${
                      customStartDate && customEndDate
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    Calculate
                  </button>
                </div>

                {customStartDate && customEndDate && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <p className="text-base font-medium text-gray-800">
                      From {customStartDate.toLocaleDateString("en-GB")} to{" "}
                      {customEndDate.toLocaleDateString("en-GB")}:
                    </p>
                    <p className="text-2xl font-bold text-green-600 mt-2">
                      GH₵ {customRevenue.toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {customCount} transaction{customCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tabValue === 1 && (
        <WebsiteTransactionsTab
          transactions={transactions}
          transactionsPage={transactionsPage}
          hasMoreTransactions={hasMoreTransactions}
          loading={loading}
          error={error}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          onDownload={handleDownloadTransactions}
        />
      )}

      {tabValue === 2 && (
        <UssdTransactionsTab
          ussdTransactions={ussdTransactions}
          ussdPage={ussdPage}
          hasMoreUssd={hasMoreUssd}
          loading={loading}
          error={error}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          onDownload={handleDownloadUssd}
        />
      )}
    </div>
  );
};

export default Dashboard;
