import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
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
import { db } from "./firebase"; // Import Firestore instance from your firebase config
import * as XLSX from "xlsx";

// --- Constants ---
const TRANSACTION_COLLECTION = "data_approve_teller_transaction";
const USSD_COLLECTION = "teller-response-calls"; // Target collection for USSD
const PAGE_SIZE = 6;
const MAX_EXPORT_RECORDS = 1000;
const BATCH_SIZE = 500;

// --- Utility Functions ---

// Utility to extract GB from desc field
const extractGB = (desc) => {
  if (!desc) return "N/A";
  // Updated regex to handle format like "1GB" or "200MB" or "2GB-Plan"
  const match = desc.match(/(\d)/i);
  return match ? match[1].toUpperCase() : "N/A";
};

// Utility to format phone number
const formatPhoneNumber = (number) => {
  if (!number) return "N/A";
  // Convert to string and remove leading '233'
  const cleanedNumber = String(number).replace(/^233/, "");
  // Prepend '0' if it's a 9-digit number after cleaning
  return cleanedNumber.length === 9
    ? `0${cleanedNumber}`
    : cleanedNumber || "N/A";
};

// Utility to download data as Excel
const downloadExcel = (data, fileName, headers) => {
  const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, fileName);
};

// Utility to debounce a function
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// --- Memoized Components ---

// Memoized Transaction Card for mobile (Regular)
const TransactionCard = memo(({ tx }) => (
  <div className="p-3 bg-white rounded-lg shadow-sm">
    <p className="text-xs text-gray-800">
      <span className="font-semibold">Number:</span>{" "}
      {formatPhoneNumber(tx.subscriber_number || tx.number || "N/A")}
    </p>
    <p className="text-xs text-gray-800 mt-1">
      <span className="font-semibold">Data:</span>{" "}
      {tx.gb || extractGB(tx.desc) || "N/A"}
    </p>
    <p className="text-xs text-gray-800 mt-1">
      <span className="font-semibold">Created At:</span>{" "}
      {tx.createdAt ? new Date(tx.createdAt.toDate()).toLocaleString() : "N/A"}
    </p>
  </div>
));

// Memoized USSD Transaction Card for mobile (Updated)
const UssdTransactionCard = memo(({ tx }) => (
  <div className="p-3 bg-white rounded-lg shadow-sm">
    <p className="text-xs text-gray-800">
      <span className="font-semibold">Number:</span>{" "}
      {formatPhoneNumber(tx.subscriber_number || "N/A")}
    </p>
    <p className="text-xs text-gray-800 mt-1">
      <span className="font-semibold">Data:</span> {extractGB(tx.desc) || "N/A"}
    </p>
    <p className="text-xs text-gray-800 mt-1">
      <span className="font-semibold">Date:</span>{" "}
      {tx.createdAt ? new Date(tx.createdAt.toDate()).toLocaleString() : "N/A"}
    </p>
  </div>
));

// Skeleton Loader for mobile
const SkeletonCard = () => (
  <div className="p-3 bg-white rounded-lg shadow-sm animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
  </div>
);

// --- Dashboard Component ---

const Dashboard = () => {
  // --- Shared State ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("transactions"); // 'transactions' or 'ussd'
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [recordCount, setRecordCount] = useState(0);

  // --- Transaction State (Regular) ---
  const [transactions, setTransactions] = useState([]);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsLastDocs, setTransactionsLastDocs] = useState([]);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [transactionsCache, setTransactionsCache] = useState({});
  const [totalTransactions, setTotalTransactions] = useState(0);

  // --- USSD Transaction State (Updated) ---
  const [ussdTransactions, setUssdTransactions] = useState([]);
  const [ussdPage, setUssdPage] = useState(1);
  const [ussdLastDocs, setUssdLastDocs] = useState([]);
  const [hasMoreUssd, setHasMoreUssd] = useState(true);
  const [ussdCache, setUssdCache] = useState({});
  const [totalUssd, setTotalUssd] = useState(0);

  // --- Data Fetching Logic ---

  const getBaseQuery = (
    collectionName,
    statusFilter = true,
    exportedFilter = true
  ) => {
    let baseQuery = collection(db, collectionName);
    const conditions = [];

    if (statusFilter) {
      conditions.push(where("status", "==", "approved"));
    }
    if (exportedFilter) {
      conditions.push(where("exported", "==", false));
    }

    // USSD uses `createdAt` for ordering, regular may use it too
    conditions.push(orderBy("createdAt", "desc"));

    return conditions.length > 0
      ? query(baseQuery, ...conditions)
      : query(baseQuery);
  };

  // Fetch total count of regular transactions
  const fetchTotalTransactions = useCallback(async () => {
    try {
      const q = getBaseQuery(TRANSACTION_COLLECTION, true, true);
      const querySnapshot = await getDocs(q);
      setTotalTransactions(querySnapshot.size);
    } catch (err) {
      setError("Failed to fetch total transactions count: " + err.message);
      console.error("Failed to fetch total transactions count:", err);
    }
  }, []);

  // Fetch transactions with pagination and caching
  const fetchTransactions = useCallback(
    async (page = 1) => {
      if (transactionsCache[page]) {
        setTransactions(transactionsCache[page]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        let q = getBaseQuery(TRANSACTION_COLLECTION, true, true, false);

        if (page > 1 && transactionsLastDocs[page - 2]) {
          q = query(
            q,
            startAfter(transactionsLastDocs[page - 2]),
            limit(PAGE_SIZE)
          );
        } else {
          q = query(q, limit(PAGE_SIZE));
        }

        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setTransactions(data);
        setTransactionsCache((prev) => ({ ...prev, [page]: data }));

        if (querySnapshot.docs.length > 0) {
          const newLastDocs = [...transactionsLastDocs];
          newLastDocs[page - 1] =
            querySnapshot.docs[querySnapshot.docs.length - 1];
          setTransactionsLastDocs(newLastDocs);
        }
        setHasMoreTransactions(querySnapshot.docs.length === PAGE_SIZE);
        setLoading(false);
      } catch (err) {
        setError("Failed to fetch transactions: " + err.message);
        console.error("Failed to fetch transactions:", err);
        setLoading(false);
      }
    },
    [transactionsCache, transactionsLastDocs]
  );

  // Fetch total count of USSD transactions (Updated)
  const fetchTotalUssd = useCallback(async () => {
    try {
      // Filter by status == "approved" and exported == false
      const q = getBaseQuery(USSD_COLLECTION, true, true);
      const querySnapshot = await getDocs(q);
      setTotalUssd(querySnapshot.size);
    } catch (err) {
      setError("Failed to fetch total USSD count: " + err.message);
      console.error("Failed to fetch total USSD count:", err);
    }
  }, []);

  // Fetch USSD transactions with pagination and caching (Updated)
  const fetchUssdTransactions = useCallback(
    async (page = 1) => {
      if (ussdCache[page]) {
        setUssdTransactions(ussdCache[page]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Filter by status == "approved" and exported == false
        let q = getBaseQuery(USSD_COLLECTION,true, true, false);

        if (page > 1 && ussdLastDocs[page - 2]) {
          q = query(q, startAfter(ussdLastDocs[page - 2]), limit(PAGE_SIZE));
        } else {
          q = query(q, limit(PAGE_SIZE));
        }

        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setUssdTransactions(data);
        setUssdCache((prev) => ({ ...prev, [page]: data }));

        if (querySnapshot.docs.length > 0) {
          const newLastDocs = [...ussdLastDocs];
          newLastDocs[page - 1] =
            querySnapshot.docs[querySnapshot.docs.length - 1];
          setUssdLastDocs(newLastDocs);
        }
        setHasMoreUssd(querySnapshot.docs.length === PAGE_SIZE);
        setLoading(false);
      } catch (err) {
        setError("Failed to fetch USSD transactions: " + err.message);
        console.error("Failed to fetch USSD transactions:", err);
        setLoading(false);
      }
    },
    [ussdCache, ussdLastDocs]
  );

  // --- Effects ---

  // Initial and subsequent data fetch based on active tab
  useEffect(() => {
    setError(null); // Clear error on tab/page change
    setLoading(true);
    if (activeTab === "transactions") {
      fetchTransactions(transactionsPage);
      fetchTotalTransactions();
    } else {
      fetchUssdTransactions(ussdPage);
      fetchTotalUssd();
    }
  }, [
    activeTab,
    transactionsPage,
    ussdPage,
    fetchTransactions,
    fetchTotalTransactions,
    fetchUssdTransactions,
    fetchTotalUssd,
  ]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // --- Handlers ---

  // Handle download for Transactions
  const handleDownloadTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const q = getBaseQuery(TRANSACTION_COLLECTION, true, true, false);
      const limitQ = query(q, limit(MAX_EXPORT_RECORDS));

      const querySnapshot = await getDocs(limitQ);
      const docs = querySnapshot.docs;
      const data = docs.map((doc) => {
        const docData = doc.data();
        return {
          Number: formatPhoneNumber(
            docData.recipient_number || docData.subscriber_number || "N/A"
          ),
          Data: docData.gb || extractGB(docData.desc) || "N/A", // Changed GB to Data for clarity
          CreatedAt: docData.createdAt
            ? new Date(docData.createdAt.toDate()).toLocaleString()
            : "N/A",
        };
      });

      setRecordCount(docs.length);
      // Batch update 'exported' status
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const batchDocs = docs.slice(i, i + BATCH_SIZE);
        batchDocs.forEach((docSnap) => {
          const docRef = doc(db, TRANSACTION_COLLECTION, docSnap.id);
          batch.update(docRef, { exported: true });
        });
        await batch.commit();
      }

      downloadExcel(data, "Transactions.xlsx", ["Number", "Data", "CreatedAt"]);
      setTransactionsCache({});
      setTransactionsPage(1);
      setTransactionsLastDocs([]);
      setHasMoreTransactions(true);
      await fetchTransactions(1);
      await fetchTotalTransactions();
    } catch (err) {
      setError("Failed to download or update transactions: " + err.message);
      console.error("Failed to download or update transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchTransactions, fetchTotalTransactions]);

  // Handle download for USSD Transactions (Updated to be similar)
  const handleDownloadUssd = useCallback(async () => {
    try {
      setLoading(true);
      // Filter by status == "approved" and exported == false
      const q = getBaseQuery(USSD_COLLECTION, true, false);
      const limitQ = query(q, limit(MAX_EXPORT_RECORDS));

      const querySnapshot = await getDocs(limitQ);
      const docs = querySnapshot.docs;
      const data = docs.map((doc) => {
        const docData = doc.data();
        return {
          Number: formatPhoneNumber(docData.subscriber_number || "N/A"), // Use subscriber_number
          Data: extractGB(docData.desc) || "N/A", // Extract data size from desc
          CreatedAt: docData.createdAt
            ? new Date(docData.createdAt.toDate()).toLocaleString()
            : "N/A",
        };
      });

      setRecordCount(docs.length);

      // Batch update 'exported' status to TRUE, similar to normal transactions
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const batchDocs = docs.slice(i, i + BATCH_SIZE);
        batchDocs.forEach((docSnap) => {
          const docRef = doc(db, USSD_COLLECTION, docSnap.id);
          // Assuming the USSD collection also has an 'exported' field
          batch.update(docRef, { exported: true });
        });
        await batch.commit();
      }

      downloadExcel(data, "UssdTransactions.xlsx", [
        "Number",
        "Data",
        "CreatedAt",
      ]);

      // Reset state and re-fetch the first page after export
      setUssdCache({});
      setUssdPage(1);
      setUssdLastDocs([]);
      setHasMoreUssd(true);
      await fetchUssdTransactions(1);
      await fetchTotalUssd();
    } catch (err) {
      setError(
        "Failed to download or update USSD transactions: " + err.message
      );
      console.error("Failed to download or update USSD transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchUssdTransactions, fetchTotalUssd]);

  // Handle confirmation dialog
  const openConfirmDialog = useCallback(async (action, collectionName) => {
    try {
      setLoading(true);
      const collectionRef = collection(db, collectionName);

      let q;
      if (collectionName === TRANSACTION_COLLECTION) {
        q = query(
          collectionRef,
          where("status", "==", "approved"),
          where("exported", "==", false),
          limit(MAX_EXPORT_RECORDS)
        );
      } else {
        // For USSD
        q = query(
          collectionRef,
          where("status", "==", "approved"), // Filter for approved status
          where("exported", "==", false), // Filter for not exported
          limit(MAX_EXPORT_RECORDS)
        );
      }

      const querySnapshot = await getDocs(q);
      setRecordCount(querySnapshot.docs.length);
      setConfirmAction(() => action);
      setShowConfirmDialog(true);
    } catch (err) {
      setError("Failed to fetch record count: " + err.message);
      console.error("Failed to fetch record count:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const closeConfirmDialog = useCallback(() => {
    setShowConfirmDialog(false);
    setConfirmAction(null);
    setRecordCount(0);
  }, []);

  const confirmDownload = useCallback(() => {
    if (confirmAction) {
      confirmAction();
    }
    closeConfirmDialog();
  }, [confirmAction, closeConfirmDialog]);

  // Debounced pagination controls for Transactions
  const handlePrevPageTransactions = useCallback(
    debounce(() => {
      if (transactionsPage > 1) {
        setTransactionsPage((prev) => prev - 1);
      }
    }, 300),
    [transactionsPage]
  );

  const handleNextPageTransactions = useCallback(
    debounce(() => {
      if (hasMoreTransactions) {
        setTransactionsPage((prev) => prev + 1);
      }
    }, 300),
    [hasMoreTransactions]
  );

  // Debounced pagination controls for USSD
  const handlePrevPageUssd = useCallback(
    debounce(() => {
      if (ussdPage > 1) {
        setUssdPage((prev) => prev - 1);
      }
    }, 300),
    [ussdPage]
  );

  const handleNextPageUssd = useCallback(
    debounce(() => {
      if (hasMoreUssd) {
        setUssdPage((prev) => prev + 1);
      }
    }, 300),
    [hasMoreUssd]
  );

  // --- Memoized Data for Rendering ---

  const memoizedTransactions = useMemo(() => transactions, [transactions]);
  const memoizedUssd = useMemo(() => ussdTransactions, [ussdTransactions]);

  // --- Render Helpers ---

  const renderPaginationControls = (
    currentPage,
    hasMore,
    handlePrev,
    handleNext
  ) => (
    <div className="flex flex-col items-center sm:flex-row sm:justify-between mt-4 space-y-2 sm:space-y-0">
      <button
        onClick={handlePrev}
        disabled={currentPage === 1}
        className={`w-full sm:w-auto px-3 sm:px-4 py-1 sm:py-2 rounded-lg text-xs sm:text-sm font-medium ${
          currentPage === 1
            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
            : "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-1 focus:ring-indigo-500"
        }`}
      >
        Previous
      </button>
      <span className="text-xs text-gray-600">Page {currentPage}</span>
      <button
        onClick={handleNext}
        disabled={!hasMore}
        className={`w-full sm:w-auto px-3 sm:px-4 py-1 sm:py-2 rounded-lg text-xs sm:text-sm font-medium ${
          !hasMore
            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
            : "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-1 focus:ring-indigo-500"
        }`}
      >
        Next
      </button>
    </div>
  );

  const renderTransactionTable = (data) => (
    <div className="hidden sm:block overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Number
            </th>
            <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Data
            </th>
            <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Created At
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((tx) => (
            <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-3 sm:px-4 py-2 text-xs text-gray-800">
                {formatPhoneNumber(tx.subscriber_number || tx.number || "N/A")}
              </td>
              <td className="px-3 sm:px-4 py-2 text-xs text-gray-800">
                {tx.gb || extractGB(tx.desc) || "N/A"}
              </td>
              <td className="px-3 sm:px-4 py-2 text-xs text-gray-800">
                {tx.createdAt
                  ? new Date(tx.createdAt.toDate()).toLocaleString()
                  : "N/A"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderUssdTable = (data) => (
    <div className="hidden sm:block overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Number
            </th>
            <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Data
            </th>
            <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Created At
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((tx) => (
            <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-3 sm:px-4 py-2 text-xs text-gray-800">
                {formatPhoneNumber(tx.subscriber_number || "N/A")}
              </td>
              <td className="px-3 sm:px-4 py-2 text-xs text-gray-800">
                {extractGB(tx.desc) || "N/A"}
              </td>
              <td className="px-3 sm:px-4 py-2 text-xs text-gray-800">
                {tx.createdAt
                  ? new Date(tx.createdAt.toDate()).toLocaleString()
                  : "N/A"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderTransactionSection = () => (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 sm:mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800">
          Approved Teller Transactions
        </h2>
        {transactions.length > 0 && (
          <button
            onClick={() =>
              openConfirmDialog(
                handleDownloadTransactions,
                TRANSACTION_COLLECTION
              )
            }
            className="mt-2 sm:mt-0 px-3 sm:px-4 py-1 sm:py-2 bg-indigo-600 text-white rounded-lg text-xs sm:text-sm hover:bg-indigo-700 focus:ring-1 focus:ring-indigo-500 shadow-sm"
          >
            Export Transactions
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Total Pending Export: {totalTransactions} | Page {transactionsPage} (
        {transactions.length})
      </p>
      {transactions.length > 0 ? (
        <>
          {renderTransactionTable(memoizedTransactions)}
          <div className="sm:hidden space-y-3">
            {loading
              ? Array(PAGE_SIZE)
                  .fill()
                  .map((_, index) => <SkeletonCard key={index} />)
              : memoizedTransactions.map((tx) => (
                  <TransactionCard key={tx.id} tx={tx} />
                ))}
          </div>
          {renderPaginationControls(
            transactionsPage,
            hasMoreTransactions,
            handlePrevPageTransactions,
            handleNextPageTransactions
          )}
        </>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm text-gray-500">
            No approved transactions pending export.
          </p>
        </div>
      )}
    </div>
  );

  const renderUssdSection = () => (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 sm:mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800">
          Approved USSD Transactions
        </h2>
        {ussdTransactions.length > 0 && (
          <button
            onClick={() =>
              openConfirmDialog(handleDownloadUssd, USSD_COLLECTION)
            }
            className="mt-2 sm:mt-0 px-3 sm:px-4 py-1 sm:py-2 bg-indigo-600 text-white rounded-lg text-xs sm:text-sm hover:bg-indigo-700 focus:ring-1 focus:ring-indigo-500 shadow-sm"
          >
            Export USSD Data
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Total Pending Export: {totalUssd} | Page {ussdPage} (
        {ussdTransactions.length})
      </p>
      {ussdTransactions.length > 0 ? (
        <>
          {renderUssdTable(memoizedUssd)}
          <div className="sm:hidden space-y-3">
            {loading
              ? Array(PAGE_SIZE)
                  .fill()
                  .map((_, index) => <SkeletonCard key={index} />)
              : memoizedUssd.map((tx) => (
                  <UssdTransactionCard key={tx.id} tx={tx} />
                ))}
          </div>
          {renderPaginationControls(
            ussdPage,
            hasMoreUssd,
            handlePrevPageUssd,
            handleNextPageUssd
          )}
        </>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm text-gray-500">
            No approved USSD transactions pending export.
          </p>
        </div>
      )}
    </div>
  );

  // --- Main Render ---

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      {/* Header */}
      <header className="mb-3 bg-white shadow-sm rounded-lg p-3 sm:p-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
          Transaction Dashboard
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          View and export approved transactions from teller and USSD channels
        </p>
      </header>

      {/* Tab Navigation */}
      <div className="mb-3 sm:mb-4 flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("transactions")}
          className={`py-2 px-4 text-sm font-medium transition-colors ${
            activeTab === "transactions"
              ? "border-b-2 border-indigo-600 text-indigo-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Teller Transactions
        </button>
        <button
          onClick={() => setActiveTab("ussd")}
          className={`py-2 px-4 text-sm font-medium transition-colors ${
            activeTab === "ussd"
              ? "border-b-2 border-indigo-600 text-indigo-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          USSD Transactions
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-3 sm:p-4 w-full max-w-[90%] sm:max-w-sm mx-4 shadow-lg">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-3">
              Confirm Export
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
              Export {recordCount} records?
              <span className="block mt-1">
                This will mark them as **exported** and they will no longer
                appear on this dashboard.
              </span>
              {recordCount >= MAX_EXPORT_RECORDS && (
                <span className="block mt-1 text-xs text-red-500">
                  Only the first {MAX_EXPORT_RECORDS} records will be exported.
                </span>
              )}
            </p>
            <div className="flex justify-end space-x-2 sm:space-x-3">
              <button
                onClick={closeConfirmDialog}
                className="px-3 sm:px-4 py-1 sm:py-2 bg-gray-200 text-gray-700 rounded-lg text-xs sm:text-sm hover:bg-gray-300 focus:ring-1 focus:ring-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={confirmDownload}
                className="px-3 sm:px-4 py-1 sm:py-2 bg-indigo-600 text-white rounded-lg text-xs sm:text-sm hover:bg-indigo-700 focus:ring-1 focus:ring-indigo-500"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-full mx-auto bg-white rounded-lg shadow-sm p-3 sm:p-4">
        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-6 sm:py-8">
            <div className="animate-spin rounded-full h-6 sm:h-8 w-6 sm:w-8 border-t-2 border-b-2 border-indigo-600"></div>
            <span className="mt-2 text-xs sm:text-sm text-gray-600">
              Loading{" "}
              {activeTab === "transactions" ? "Teller data" : "USSD data"}...
            </span>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-red-50 border-l-2 border-red-400 text-red-600 p-3 rounded-md my-3 sm:my-4">
            <p className="text-xs sm:text-sm font-medium">⚠️ {error}</p>
            <p className="text-xs">Clears in 5 seconds.</p>
          </div>
        )}

        {/* Content Section */}
        {!loading && !error && (
          <>
            {activeTab === "transactions" && renderTransactionSection()}
            {activeTab === "ussd" && renderUssdSection()}
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
