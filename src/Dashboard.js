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

// Utility to extract GB from desc field
const extractGB = (desc) => {
  if (!desc) return "N/A";
  const match = desc.match(/(\d+)GB/);
  return match ? match[1] : "N/A";
};

// Utility to format phone number
const formatPhoneNumber = (number) => {
  if (!number) return "N/A";
  const cleanedNumber = number.replace(/^233/, "");
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

// Memoized Transaction Card for mobile
const TransactionCard = memo(({ tx }) => (
  <div className="p-3 bg-white rounded-lg shadow-sm">
    <p className="text-xs text-gray-800">
      <span className="font-semibold">Number:</span>{" "}
      {formatPhoneNumber(tx.subscriber_number || tx.number || "N/A")}
    </p>
    <p className="text-xs text-gray-800 mt-1">
      <span className="font-semibold">GB:</span>{" "}
      {tx.gb || extractGB(tx.desc) || "N/A"}
    </p>
    <p className="text-xs text-gray-800 mt-1">
      <span className="font-semibold">Created At:</span>{" "}
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

const Dashboard = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsLastDocs, setTransactionsLastDocs] = useState([]);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [recordCount, setRecordCount] = useState(0);
  const [transactionsCache, setTransactionsCache] = useState({});
  const [totalTransactions, setTotalTransactions] = useState(0);
  const pageSize = 6;
  const maxExportRecords = 1000;
  const batchSize = 500;

  // Memoized query fields to reduce Firestore payload
  const selectFields = [
    "subscriber_number",
    "number",
    "gb",
    "desc",
    "createdAt",
  ];

  // Fetch total count of transactions
  const fetchTotalTransactions = useCallback(async () => {
    try {
      const q = query(
        collection(db, "theteller_logs"),
        where("status", "==", "approved"),
        where("exported", "==", false)
      );
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
        let q = query(
          collection(db, "theteller_logs"),
          where("status", "==", "approved"),
          where("exported", "==", false),
          orderBy("createdAt"),
          limit(pageSize)
        );

        if (page > 1 && transactionsLastDocs[page - 2]) {
          q = query(
            collection(db, "theteller_logs"),
            where("status", "==", "approved"),
            where("exported", "==", false),
            orderBy("createdAt"),
            startAfter(transactionsLastDocs[page - 2]),
            limit(pageSize)
          );
        }

        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        console.log("Fetched transactions:", data);
        setTransactions(data);
        setTransactionsCache((prev) => ({ ...prev, [page]: data }));
        if (querySnapshot.docs.length > 0) {
          const newLastDocs = [...transactionsLastDocs];
          newLastDocs[page - 1] =
            querySnapshot.docs[querySnapshot.docs.length - 1];
          setTransactionsLastDocs(newLastDocs);
        }
        setHasMoreTransactions(querySnapshot.docs.length === pageSize);
        setLoading(false);
      } catch (err) {
        setError("Failed to fetch transactions: " + err.message);
        console.error("Failed to fetch transactions:", err);
        setLoading(false);
      }
    },
    [transactionsCache, transactionsLastDocs]
  );

  // Fetch data on mount and page change
  useEffect(() => {
    fetchTransactions(transactionsPage);
    fetchTotalTransactions();
  }, [fetchTransactions, fetchTotalTransactions, transactionsPage]);

  // Handle download for Transactions
  const handleDownloadTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "theteller_logs"),
        where("status", "==", "approved"),
        where("exported", "==", false),
        limit(maxExportRecords)
      );
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs;
      const data = docs.map((doc) => {
        const docData = doc.data();
        console.log("Raw document data:", docData);
        return {
          Number: formatPhoneNumber(
            docData.subscriber_number || docData.number || "N/A"
          ),
          GB: docData.gb || extractGB(docData.desc) || "N/A",
          CreatedAt: docData.createdAt
            ? new Date(docData.createdAt.toDate()).toLocaleString()
            : "N/A",
        };
      });

      setRecordCount(docs.length);
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchDocs = docs.slice(i, i + batchSize);
        batchDocs.forEach((docSnap) => {
          const docRef = doc(db, "theteller_logs", docSnap.id);
          batch.update(docRef, { exported: true });
        });
        await batch.commit();
      }

      downloadExcel(data, "Transactions.xlsx", ["Number", "GB", "CreatedAt"]);
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

  // Handle confirmation dialog
  const openConfirmDialog = useCallback(async (action) => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "theteller_logs"),
        where("status", "==", "approved"),
        where("exported", "==", false),
        limit(maxExportRecords)
      );
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
  }, [confirmAction]);

  // Debounced pagination controls
  const handlePrevPage = useCallback(
    debounce(() => {
      if (transactionsPage > 1) {
        setTransactionsPage((prev) => prev - 1);
      }
    }, 300),
    [transactionsPage]
  );

  const handleNextPage = useCallback(
    debounce(() => {
      if (hasMoreTransactions) {
        setTransactionsPage((prev) => prev + 1);
      }
    }, 300),
    [hasMoreTransactions]
  );

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Memoized transaction data for rendering
  const memoizedTransactions = useMemo(() => transactions, [transactions]);

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      {/* Header */}
      <header className="mb-3 bg-white shadow-sm rounded-lg p-3 sm:p-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
          Transaction Dashboard
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          View and export approved transactions
        </p>
      </header>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-3 sm:p-4 w-full max-w-[90%] sm:max-w-sm mx-4 shadow-lg">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-3">
              Confirm Export
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
              Export {recordCount} transactions? This will mark them as
              exported.
              {recordCount >= maxExportRecords && (
                <span className="block mt-1 text-xs text-red-500">
                  Only the first {maxExportRecords} records will be exported.
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
              Loading...
            </span>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-red-50 border-l-2 border-red-400 text-red-600 p-3 rounded-md my-3 sm:my-4">
            <p className="text-xs sm:text-sm font-medium">{error}</p>
            <p className="text-xs">Clears in 5 seconds.</p>
          </div>
        )}

        {/* Transactions Section */}
        {!loading && !error && (
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 sm:mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-800">
                Transactions
              </h2>
              {transactions.length > 0 && (
                <button
                  onClick={() => openConfirmDialog(handleDownloadTransactions)}
                  className="mt-2 sm:mt-0 px-3 sm:px-4 py-1 sm:py-2 bg-indigo-600 text-white rounded-lg text-xs sm:text-sm hover:bg-indigo-700 focus:ring-1 focus:ring-indigo-500 shadow-sm"
                >
                  Export to Excel
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Total: {totalTransactions} | Page {transactionsPage} (
              {transactions.length})
            </p>
            {transactions.length > 0 ? (
              <>
                {/* Table for larger screens */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Number
                        </th>
                        <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          GB
                        </th>
                        <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Created At
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {memoizedTransactions.map((tx) => (
                        <tr
                          key={tx.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-3 sm:px-4 py-2 text-xs text-gray-800">
                            {formatPhoneNumber(
                              tx.subscriber_number || tx.number || "N/A"
                            )}
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
                {/* Card layout for mobile */}
                <div className="sm:hidden space-y-3">
                  {loading
                    ? Array(pageSize)
                        .fill()
                        .map((_, index) => <SkeletonCard key={index} />)
                    : memoizedTransactions.map((tx) => (
                        <TransactionCard key={tx.id} tx={tx} />
                      ))}
                </div>
                {/* Pagination */}
                <div className="flex flex-col items-center sm:flex-row sm:justify-between mt-4 space-y-2 sm:space-y-0">
                  <button
                    onClick={handlePrevPage}
                    disabled={transactionsPage === 1}
                    className={`w-full sm:w-auto px-3 sm:px-4 py-1 sm:py-2 rounded-lg text-xs sm:text-sm font-medium ${
                      transactionsPage === 1
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-1 focus:ring-indigo-500"
                    }`}
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-600">
                    Page {transactionsPage}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={!hasMoreTransactions}
                    className={`w-full sm:w-auto px-3 sm:px-4 py-1 sm:py-2 rounded-lg text-xs sm:text-sm font-medium ${
                      !hasMoreTransactions
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-1 focus:ring-indigo-500"
                    }`}
                  >
                    Next
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500">No transactions found.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
