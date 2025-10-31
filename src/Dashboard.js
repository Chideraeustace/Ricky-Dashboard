import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  startAfter,
  orderBy,
  writeBatch,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";
import * as XLSX from "xlsx";

// --- Utilities ---
const extractGB = (desc) => {
  if (!desc) return "N/A";
  const match = desc.match(/(\d+)GB/);
  return match ? match[1] : "N/A";
};

const formatPhoneNumber = (number) => {
  if (!number) return "N/A";
  const cleanedNumber = number.replace(/^233/, "");
  return cleanedNumber.length === 9
    ? `0${cleanedNumber}`
    : cleanedNumber || "N/A";
};

const downloadExcel = (data, fileName, headers) => {
  const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, fileName);
};

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// NEW: Unique key — ONLY for USSD (externalRef)
const getUniqueKey = (record) => {
  return record.externalRef || "";
};

// --- Component ---
const Dashboard = () => {
  const [tabValue, setTabValue] = useState(0);
  const [numbers, setNumbers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [ussdTransactions, setUssdTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [numbersPage, setNumbersPage] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [ussdPage, setUssdPage] = useState(1);
  const [numbersLastDocs, setNumbersLastDocs] = useState([]);
  const [transactionsLastDocs, setTransactionsLastDocs] = useState([]);
  const [ussdLastDocs, setUssdLastDocs] = useState([]);
  const [hasMoreNumbers, setHasMoreNumbers] = useState(true);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [hasMoreUssd, setHasMoreUssd] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [recordCount, setRecordCount] = useState(0);
  const [numbersCache, setNumbersCache] = useState({});
  const [transactionsCache, setTransactionsCache] = useState({});
  const [ussdCache, setUssdCache] = useState({});
  const [totalNumbers, setTotalNumbers] = useState(0);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [totalUssd, setTotalUssd] = useState(0);
  const pageSize = 6;
  const maxExportRecords = 1000;
  const batchSize = 500;

  const handleTabChange = (newValue) => {
    setTabValue(newValue);
    if (newValue === 0) {
      setNumbersPage(1);
      setNumbersLastDocs([]);
      setHasMoreNumbers(true);
    } else if (newValue === 1) {
      setTransactionsPage(1);
      setTransactionsLastDocs([]);
      setHasMoreTransactions(true);
    } else if (newValue === 2) {
      setUssdPage(1);
      setUssdLastDocs([]);
      setHasMoreUssd(true);
    }
    setError(null);
  };

  // --- Total Counts ---
  const fetchTotalNumbers = async () => {
    try {
      const q = query(
        collection(db, "entries"),
        where("exported", "==", false)
      );
      const s = await getDocs(q);
      setTotalNumbers(s.size);
    } catch (err) {
      setError("Failed to fetch total numbers: " + err.message);
    }
  };

  const fetchTotalTransactions = async () => {
    try {
      const q = query(
        collection(db, "webite_purchase"),
        where("status", "==", "approved"),
        where("exported", "==", false)
      );
      const s = await getDocs(q);
      setTotalTransactions(s.size);
    } catch (err) {
      setError("Failed to fetch total transactions: " + err.message);
    }
  };

  const fetchTotalUssd = async () => {
    try {
      const q = query(
        collection(db, "data_purchase"),
        where("status", "==", "approved"),
        where("exported", "==", false)
      );
      const s = await getDocs(q);
      setTotalUssd(s.size);
    } catch (err) {
      setError("Failed to fetch total USSD: " + err.message);
    }
  };

  // --- Fetch Numbers (NO DEDUPE) ---
  const fetchNumbers = async (page = 1) => {
    if (numbersCache[page]) {
      setNumbers(numbersCache[page]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      let q = query(
        collection(db, "entries"),
        where("exported", "==", false),
        orderBy("phoneNumber"),
        limit(pageSize)
      );
      if (page > 1 && numbersLastDocs[page - 2]) {
        q = query(
          collection(db, "entries"),
          where("exported", "==", false),
          orderBy("phoneNumber"),
          startAfter(numbersLastDocs[page - 2]),
          limit(pageSize)
        );
      }
      const s = await getDocs(q);
      const data = s.docs.map((d) => ({ id: d.id, ...d.data() }));

      setNumbers(data);
      setNumbersCache((p) => ({ ...p, [page]: data }));
      if (s.docs.length > 0) {
        const ld = [...numbersLastDocs];
        ld[page - 1] = s.docs[s.docs.length - 1];
        setNumbersLastDocs(ld);
      }
      setHasMoreNumbers(s.docs.length === pageSize);
      setLoading(false);
    } catch (err) {
      setError("Failed to fetch numbers: " + err.message);
      setLoading(false);
    }
  };

  // --- Fetch Website Transactions (NO DEDUPE) ---
  const fetchTransactions = async (page = 1) => {
    if (transactionsCache[page]) {
      setTransactions(transactionsCache[page]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      let q = query(
        collection(db, "webite_purchase"),
        where("status", "==", "approved"),
        where("exported", "==", false),
        orderBy("createdAt"),
        limit(pageSize)
      );
      if (page > 1 && transactionsLastDocs[page - 2]) {
        q = query(
          collection(db, "webite_purchase"),
          where("status", "==", "approved"),
          where("exported", "==", false),
          orderBy("createdAt"),
          startAfter(transactionsLastDocs[page - 2]),
          limit(pageSize)
        );
      }
      const s = await getDocs(q);
      const data = s.docs.map((d) => ({ id: d.id, ...d.data() }));

      setTransactions(data);
      setTransactionsCache((p) => ({ ...p, [page]: data }));
      if (s.docs.length > 0) {
        const ld = [...transactionsLastDocs];
        ld[page - 1] = s.docs[s.docs.length - 1];
        setTransactionsLastDocs(ld);
      }
      setHasMoreTransactions(s.docs.length === pageSize);
      setLoading(false);
    } catch (err) {
      setError("Failed to fetch transactions: " + err.message);
      setLoading(false);
    }
  };

  // --- Fetch USSD Transactions (DEDUPE by externalRef) ---
  const fetchUssdTransactions = async (page = 1) => {
    if (ussdCache[page]) {
      setUssdTransactions(ussdCache[page]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      let q = query(
        collection(db, "data_purchase"),
        where("status", "==", "approved"),
        where("exported", "==", false),
        limit(pageSize)
      );
      if (page > 1 && ussdLastDocs[page - 2]) {
        q = query(
          collection(db, "data_purchase"),
          where("status", "==", "approved"),
          where("exported", "==", false),
          startAfter(ussdLastDocs[page - 2]),
          limit(pageSize)
        );
      }
      const s = await getDocs(q);
      const raw = s.docs.map((d) => ({ id: d.id, ...d.data() }));

      const seen = new Set();
      const data = raw.filter((r) => {
        const key = getUniqueKey(r);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setUssdTransactions(data);
      setUssdCache((p) => ({ ...p, [page]: data }));
      if (s.docs.length > 0) {
        const ld = [...ussdLastDocs];
        ld[page - 1] = s.docs[s.docs.length - 1];
        setUssdLastDocs(ld);
      }
      setHasMoreUssd(s.docs.length === pageSize);
      setLoading(false);
    } catch (err) {
      setError("Failed to fetch USSD transactions: " + err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tabValue === 0) {
      fetchNumbers(numbersPage);
      fetchTotalNumbers();
    } else if (tabValue === 1) {
      fetchTransactions(transactionsPage);
      fetchTotalTransactions();
    } else if (tabValue === 2) {
      fetchUssdTransactions(ussdPage);
      fetchTotalUssd();
    }
  }, [tabValue, numbersPage, transactionsPage, ussdPage]);

  // --- Export: Numbers (NO DEDUPE) ---
  const handleDownloadNumbers = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "entries"),
        where("exported", "==", false),
        limit(maxExportRecords)
      );
      const s = await getDocs(q);
      const docs = s.docs;

      const data = docs.map((d) => ({
        "Phone Number": formatPhoneNumber(d.data().phoneNumber),
        "Network Provider": d.data().networkProvider || "N/A",
      }));

      setRecordCount(docs.length);

      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchDocs = docs.slice(i, i + batchSize);
        batchDocs.forEach((d) => {
          const ref = doc(db, "entries", d.id);
          batch.update(ref, { exported: true });
        });
        await batch.commit();
      }

      downloadExcel(data, "Numbers.xlsx", ["Phone Number", "Network Provider"]);

      setNumbersCache({});
      setNumbersPage(1);
      setNumbersLastDocs([]);
      setHasMoreNumbers(true);
      await fetchNumbers(1);
      await fetchTotalNumbers();
    } catch (err) {
      setError("Failed to download numbers: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Export: Website Transactions (NO DEDUPE) ---
  const handleDownloadTransactions = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "webite_purchase"),
        where("status", "==", "approved"),
        where("exported", "==", false),
        limit(maxExportRecords)
      );
      const s = await getDocs(q);
      const docs = s.docs;

      const data = docs.map((d) => ({
        Number: formatPhoneNumber(d.data().phoneNumber),
        GB: extractGB(d.data().serviceName) || "N/A",
      }));

      setRecordCount(docs.length);

      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchDocs = docs.slice(i, i + batchSize);
        batchDocs.forEach((d) => {
          const ref = doc(db, "webite_purchase", d.id);
          batch.update(ref, { exported: true });
        });
        await batch.commit();
      }

      downloadExcel(data, "Transactions.xlsx", ["Number", "GB"]);

      setTransactionsCache({});
      setTransactionsPage(1);
      setTransactionsLastDocs([]);
      setHasMoreTransactions(true);
      await fetchTransactions(1);
      await fetchTotalTransactions();
    } catch (err) {
      setError("Failed to download transactions: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Export: USSD (DEDUPE by externalRef) ---
  const handleDownloadUssd = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "data_purchase"),
        where("status", "==", "approved"),
        where("exported", "==", false),
        limit(maxExportRecords)
      );
      const s = await getDocs(q);
      const docs = s.docs;

      const seen = new Set();
      const uniqueDocs = docs.filter((d) => {
        const key = getUniqueKey(d.data());
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const data = uniqueDocs.map((d) => ({
        Number: formatPhoneNumber(d.data().phoneNumber),
        GB: extractGB(d.data().serviceName) || "N/A",
      }));

      setRecordCount(uniqueDocs.length);

      for (let i = 0; i < uniqueDocs.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchDocs = uniqueDocs.slice(i, i + batchSize);
        batchDocs.forEach((d) => {
          const ref = doc(db, "data_purchase", d.id);
          batch.update(ref, { exported: true });
        });
        await batch.commit();
      }

      downloadExcel(data, "UssdTransactions.xlsx", ["Number", "GB"]);

      setUssdCache({});
      setUssdPage(1);
      setUssdLastDocs([]);
      setHasMoreUssd(true);
      await fetchUssdTransactions(1);
      await fetchTotalUssd();
    } catch (err) {
      setError("Failed to download USSD: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Confirm Dialog: Unique count only for USSD ---
  const openConfirmDialog = async (action) => {
    try {
      setLoading(true);
      let q;
      if (tabValue === 0) {
        q = query(
          collection(db, "entries"),
          where("exported", "==", false),
          limit(maxExportRecords)
        );
      } else if (tabValue === 1) {
        q = query(
          collection(db, "webite_purchase"),
          where("status", "==", "approved"),
          where("exported", "==", false),
          limit(maxExportRecords)
        );
      } else if (tabValue === 2) {
        q = query(
          collection(db, "data_purchase"),
          where("status", "==", "approved"),
          where("exported", "==", false),
          limit(maxExportRecords)
        );
      }

      const s = await getDocs(q);
      const raw = s.docs.map((d) => d.data());

      let count;
      if (tabValue === 2) {
        const seen = new Set();
        count = raw.filter((r) => {
          const key = getUniqueKey(r);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).length;
      } else {
        count = raw.length;
      }

      setRecordCount(count);
      setConfirmAction(() => action);
      setShowConfirmDialog(true);
    } catch (err) {
      setError("Failed to fetch record count: " + err.message);
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

  const handlePrevPage = useCallback(
    debounce(() => {
      if (tabValue === 0 && numbersPage > 1) setNumbersPage((p) => p - 1);
      else if (tabValue === 1 && transactionsPage > 1)
        setTransactionsPage((p) => p - 1);
      else if (tabValue === 2 && ussdPage > 1) setUssdPage((p) => p - 1);
    }, 300),
    [tabValue]
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

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

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
                : "unique USSD transactions"}
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
        <button
          className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors duration-200 sm:text-base ${
            tabValue === 0
              ? "border-b-4 border-blue-600 text-blue-600 bg-blue-50"
              : "text-gray-600 hover:text-blue-600 hover:bg-gray-50"
          }`}
          onClick={() => handleTabChange(0)}
        >
          Numbers
        </button>
        <button
          className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors duration-200 sm:text-base ${
            tabValue === 1
              ? "border-b-4 border-blue-600 text-blue-600 bg-blue-50"
              : "text-gray-600 hover:text-blue-600 hover:bg-gray-50"
          }`}
          onClick={() => handleTabChange(1)}
        >
          Website Transactions
        </button>
        <button
          className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors duration-200 sm:text-base ${
            tabValue === 2
              ? "border-b-4 border-blue-600 text-blue-600 bg-blue-50"
              : "text-gray-600 hover:text-blue-600 hover:bg-gray-50"
          }`}
          onClick={() => handleTabChange(2)}
        >
          USSD Transactions
        </button>
      </div>

      {loading && (
        <div className="mt-6 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      )}

      {!loading && error && (
        <p className="mt-6 text-center text-red-500 text-lg">{error}</p>
      )}

      {/* Numbers Tab */}
      {tabValue === 0 && !loading && !error && (
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
              New Numbers
            </h2>
            {numbers.length > 0 && (
              <button
                onClick={() => openConfirmDialog(handleDownloadNumbers)}
                className="mt-2 sm:mt-0 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base shadow-md"
              >
                Download Numbers (Excel)
              </button>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Total Records: {totalNumbers} | Page: {numbers.length} (Page{" "}
            {numbersPage})
          </p>
          {numbers.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {numbers.map((num) => (
                  <div
                    key={num.id}
                    className="p-4 bg-white rounded-lg shadow-md hover:shadow-lg"
                  >
                    <p>
                      <span className="font-semibold">Phone:</span>{" "}
                      {formatPhoneNumber(num.phoneNumber)}
                    </p>
                    <p>
                      <span className="font-semibold">Network:</span>{" "}
                      {num.networkProvider || "N/A"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-6">
                <button
                  onClick={handlePrevPage}
                  disabled={numbersPage === 1}
                  className={`px-4 py-2 rounded-lg text-sm sm:text-base ${
                    numbersPage === 1
                      ? "bg-gray-300 text-gray-500"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Previous
                </button>
                <span className="text-sm sm:text-base text-gray-600">
                  Page {numbersPage}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={!hasMoreNumbers}
                  className={`px-4 py-2 rounded-lg text-sm sm:text-base ${
                    !hasMoreNumbers
                      ? "bg-gray-300 text-gray-500"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <p className="text-gray-600 text-center text-lg">
              No numbers found.
            </p>
          )}
        </div>
      )}

      {/* Website Transactions */}
      {tabValue === 1 && !loading && !error && (
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
              Today's Transactions
            </h2>
            {transactions.length > 0 && (
              <button
                onClick={() => openConfirmDialog(handleDownloadTransactions)}
                className="mt-2 sm:mt-0 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base shadow-md"
              >
                Download Transactions (Excel)
              </button>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Total Records: {totalTransactions} | Page: {transactions.length}{" "}
            (Page {transactionsPage})
          </p>
          {transactions.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-4 bg-white rounded-lg shadow-md hover:shadow-lg"
                  >
                    <p>
                      <span className="font-semibold">Number:</span>{" "}
                      {formatPhoneNumber(tx.phoneNumber)}
                    </p>
                    <p>
                      <span className="font-semibold">GB:</span>{" "}
                      {extractGB(tx.serviceName) || "N/A"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-6">
                <button
                  onClick={handlePrevPage}
                  disabled={transactionsPage === 1}
                  className={`px-4 py-2 rounded-lg text-sm sm:text-base ${
                    transactionsPage === 1
                      ? "bg-gray-300 text-gray-500"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Previous
                </button>
                <span className="text-sm sm:text-base text-gray-600">
                  Page {transactionsPage}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={!hasMoreTransactions}
                  className={`px-4 py-2 rounded-lg text-sm sm:text-base ${
                    !hasMoreTransactions
                      ? "bg-gray-300 text-gray-500"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <p className="text-gray-600 text-center text-lg">
              No transactions found.
            </p>
          )}
        </div>
      )}

      {/* USSD Transactions */}
      {tabValue === 2 && !loading && !error && (
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
              Today's USSD Transactions
            </h2>
            {ussdTransactions.length > 0 && (
              <button
                onClick={() => openConfirmDialog(handleDownloadUssd)}
                className="mt-2 sm:mt-0 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base shadow-md"
              >
                Download USSD (Excel)
              </button>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Total Raw Records: {totalUssd} | Unique on Page:{" "}
            {ussdTransactions.length} (Page {ussdPage})
          </p>
          {ussdTransactions.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ussdTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-4 bg-white rounded-lg shadow-md hover:shadow-lg"
                  >
                    <p>
                      <span className="font-semibold">Number:</span>{" "}
                      {formatPhoneNumber(tx.phoneNumber)}
                    </p>
                    <p>
                      <span className="font-semibold">GB:</span>{" "}
                      {extractGB(tx.serviceName) || "N/A"}
                    </p>
                    {tx.externalRef && (
                      <p className="text-xs text-gray-500 mt-1">
                        Ref: {tx.externalRef}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-6">
                <button
                  onClick={handlePrevPage}
                  disabled={ussdPage === 1}
                  className={`px-4 py-2 rounded-lg text-sm sm:text-base ${
                    ussdPage === 1
                      ? "bg-gray-300 text-gray-500"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Previous
                </button>
                <span className="text-sm sm:text-base text-gray-600">
                  Page {ussdPage}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={!hasMoreUssd}
                  className={`px-4 py-2 rounded-lg text-sm sm:text-base ${
                    !hasMoreUssd
                      ? "bg-gray-300 text-gray-500"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <p className="text-gray-600 text-center text-lg">
              No USSD transactions found.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
