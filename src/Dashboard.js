/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import * as XLSX from "xlsx";

import NumbersTab from "./components/NumbersTab";
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

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/* ------------------------------------------------------------------ */
/*  Dashboard component                                               */
/* ------------------------------------------------------------------ */
const Dashboard = () => {
  /* -------------------------- State -------------------------- */
  const [tabValue, setTabValue] = useState(0);

  const [numbers, setNumbers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [ussdTransactions, setUssdTransactions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [numbersPage, setNumbersPage] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [ussdPage, setUssdPage] = useState(1);
  const [hasMoreNumbers, setHasMoreNumbers] = useState(true);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [hasMoreUssd, setHasMoreUssd] = useState(true);

  const [totalNumbers, setTotalNumbers] = useState(0);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [totalUssd, setTotalUssd] = useState(0);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [recordCount, setRecordCount] = useState(0);

  const pageSize = 6;
  const maxExportRecords = 1000;
  const batchSize = 500;

  /* ----------------------- Tab handling ---------------------- */
  const handleTabChange = (newValue) => {
    setTabValue(newValue);
    setError(null);
    if (newValue === 0) {
      setNumbersPage(1);
      setHasMoreNumbers(true);
    } else if (newValue === 1) {
      setTransactionsPage(1);
      setHasMoreTransactions(true);
    } else if (newValue === 2) {
      setUssdPage(1);
      setHasMoreUssd(true);
    }
  };

  /* -------------------------- Totals -------------------------- */
  const fetchTotalNumbers = async () => {
    try {
      const q = query(
        collection(db, "entries"),
        where("exported", "==", false)
      );
      const snap = await getDocs(q);
      setTotalNumbers(snap.size);
    } catch (e) {
      setError("Failed to fetch total numbers: " + e.message);
    }
  };

  const fetchTotalTransactions = async () => {
    try {
      const q = query(
        collection(db, "webite_purchase"),
        where("status", "==", "approved"),
        where("exported", "==", false)
      );
      const snap = await getDocs(q);
      setTotalTransactions(snap.size);
    } catch (e) {
      setError("Failed to fetch total transactions: " + e.message);
    }
  };

  const fetchTotalUssd = async () => {
    try {
      const q = query(
        collection(db, "delivery_queue"),
        where("exported", "==", false)
      );
      const snap = await getDocs(q);
      setTotalUssd(snap.size);
    } catch (e) {
      setError("Failed to fetch total USSD: " + e.message);
    }
  };

  /* -------------------------- Fetchers -------------------------- */
  const fetchNumbers = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "entries"),
        where("exported", "==", false)
      );
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNumbers(data);
      setHasMoreNumbers(data.length === pageSize);
    } catch (e) {
      setError("Failed to fetch numbers: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "webite_purchase"),
        where("status", "==", "approved"),
        where("exported", "==", false)
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
        where("exported", "==", false)
      );
      const snap = await getDocs(q);

      const result = snap.docs.map((d) => {
        const row = d.data();
        return {
          id: d.id,
          msisdn: row.msisdn,
          gig: row.gig || "N/A",
          amount: row.amount || "N/A",
          externalRef: row.externalRef || "N/A",
          createdAt: row.createdAt,
        };
      });

      const startIdx = (ussdPage - 1) * pageSize;
      const endIdx = startIdx + pageSize;
      const pageData = result.slice(startIdx, endIdx);

      setUssdTransactions(pageData);
      setHasMoreUssd(endIdx < result.length);
    } catch (e) {
      setError("Failed to fetch USSD: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  /* -------------------------- Export Handlers -------------------------- */
  const handleDownloadNumbers = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "entries"),
        where("exported", "==", false)
      );
      const snap = await getDocs(q);
      const docs = snap.docs.slice(0, maxExportRecords);

      const data = docs.map((d) => ({
        "Phone Number": formatPhoneNumber(d.data().phoneNumber),
        "Network Provider": d.data().networkProvider || "N/A",
      }));

      setRecordCount(docs.length);

      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        docs
          .slice(i, i + batchSize)
          .forEach((d) => batch.update(d.ref, { exported: true }));
        await batch.commit();
      }

      downloadExcel(data, "Numbers", ["Phone Number", "Network Provider"]);
      await fetchNumbers();
      await fetchTotalNumbers();
    } catch (e) {
      setError("Export failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTransactions = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "webite_purchase"),
        where("status", "==", "approved"),
        where("exported", "==", false)
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
      await fetchTotalTransactions();
    } catch (e) {
      setError("Export failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadUssd = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "delivery_queue"),
        where("exported", "==", false)
      );
      const snap = await getDocs(q);
      const docs = snap.docs.slice(0, maxExportRecords);

      const data = docs.map((d) => {
        const row = d.data();
        return {
          Number: formatPhoneNumber(row.msisdn),
          GB: row.gig || "N/A",
          Amount: row.amount || "N/A",
        };
      });

      setRecordCount(docs.length);

      // BATCH UPDATE: mark as exported
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        docs
          .slice(i, i + batchSize)
          .forEach((d) => batch.update(d.ref, { exported: true }));
        await batch.commit();
      }

      downloadExcel(data, "UssdTransactions", ["Number", "GB", "Amount"]);
      await fetchUssdTransactions();
      await fetchTotalUssd();
    } catch (e) {
      setError("USSD export failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  /* -------------------------- Confirm Dialog -------------------------- */
  const openConfirmDialog = async (action) => {
    try {
      setLoading(true);
      let count = 0;
      if (tabValue === 0) {
        const q = query(
          collection(db, "entries"),
          where("exported", "==", false)
        );
        const snap = await getDocs(q);
        count = snap.size;
      } else if (tabValue === 1) {
        const q = query(
          collection(db, "webite_purchase"),
          where("status", "==", "approved"),
          where("exported", "==", false)
        );
        const snap = await getDocs(q);
        count = snap.size;
      } else if (tabValue === 2) {
        const q = query(
          collection(db, "delivery_queue"),
          where("exported", "==", false)
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

  const closeConfirmDialog = () => {
    setShowConfirmDialog(false);
    setConfirmAction(null);
    setRecordCount(0);
  };

  const confirmDownload = () => {
    if (confirmAction) confirmAction();
    closeConfirmDialog();
  };

  /* -------------------------- Pagination -------------------------- */
  const handlePrevPage = useCallback(
    debounce(() => {
      if (tabValue === 0 && numbersPage > 1) setNumbersPage((p) => p - 1);
      else if (tabValue === 1 && transactionsPage > 1)
        setTransactionsPage((p) => p - 1);
      else if (tabValue === 2 && ussdPage > 1) setUssdPage((p) => p - 1);
    }, 300),
    [tabValue, numbersPage, transactionsPage, ussdPage]
  );

  const handleNextPage = useCallback(
    debounce(() => {
      if (tabValue === 0 && hasMoreNumbers) setNumbersPage((p) => p + 1);
      else if (tabValue === 1 && hasMoreTransactions)
        setTransactionsPage((p) => p + 1);
      else if (tabValue === 2 && hasMoreUssd) setUssdPage((p) => p + 1);
    }, 300),
    [tabValue, hasMoreNumbers, hasMoreTransactions, hasMoreUssd]
  );

  /* -------------------------- Effects -------------------------- */
  useEffect(() => {
    if (tabValue === 0) {
      fetchNumbers();
      fetchTotalNumbers();
    } else if (tabValue === 1) {
      fetchTransactions();
      fetchTotalTransactions();
    } else if (tabValue === 2) {
      fetchUssdTransactions();
      fetchTotalUssd();
    }
  }, [tabValue]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(t);
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
              {tabValue === 0
                ? "numbers"
                : tabValue === 1
                ? "transactions"
                : "USSD transactions"}
              ?
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
        {["Numbers", "Website Transactions", "USSD Transactions"].map(
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
          )
        )}
      </div>

      {/* Tab Content */}
      {tabValue === 0 && (
        <NumbersTab
          numbers={numbers}
          totalNumbers={totalNumbers}
          numbersPage={numbersPage}
          hasMoreNumbers={hasMoreNumbers}
          loading={loading}
          error={error}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          onDownload={() => openConfirmDialog(handleDownloadNumbers)}
        />
      )}

      {tabValue === 1 && (
        <WebsiteTransactionsTab
          transactions={transactions}
          totalTransactions={totalTransactions}
          transactionsPage={transactionsPage}
          hasMoreTransactions={hasMoreTransactions}
          loading={loading}
          error={error}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          onDownload={() => openConfirmDialog(handleDownloadTransactions)}
        />
      )}

      {tabValue === 2 && (
        <UssdTransactionsTab
          ussdTransactions={ussdTransactions}
          totalUssd={totalUssd}
          ussdPage={ussdPage}
          hasMoreUssd={hasMoreUssd}
          loading={loading}
          error={error}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          onDownload={() => openConfirmDialog(handleDownloadUssd)}
        />
      )}
    </div>
  );
};

export default Dashboard;