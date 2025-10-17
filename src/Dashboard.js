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
import { db } from "./firebase"; // Import Firestore instance from your firebase config
import * as XLSX from "xlsx";

// Utility to extract GB from desc field
const extractGB = (desc) => {
  if (!desc) return "N/A";
  const match = desc.match(/(\d+)GB/);
  return match ? match[1] : "N/A";
};

// Utility to format phone number (e.g., "233549856098" to "0549856098")
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

  // Fetch total count of transactions
  const fetchTotalTransactions = async () => {
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
  };

  // Fetch transactions with pagination and caching
  const fetchTransactions = async (page = 1) => {
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
  };

  // Fetch data and total counts on component mount and page change
  useEffect(() => {
    fetchTransactions(transactionsPage);
    fetchTotalTransactions();
  }, [transactionsPage]);

  // Handle download for Transactions with batch update
  const handleDownloadTransactions = async () => {
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
  };

  // Handle confirmation dialog
  const openConfirmDialog = async (action) => {
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
  };

  const closeConfirmDialog = () => {
    setShowConfirmDialog(false);
    setConfirmAction(null);
    setRecordCount(0);
  };

  const confirmDownload = () => {
    if (confirmAction) {
      confirmAction();
    }
    closeConfirmDialog();
  };

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

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      {/* Header */}
      <header className="mb-4 bg-white shadow-md rounded-lg p-4 sm:p-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
          Transaction Dashboard
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          View and export approved transactions
        </p>
      </header>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-[90%] sm:max-w-md mx-4 shadow-2xl transform transition-transform duration-300 scale-100">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-3 sm:mb-4">
              Confirm Export
            </h3>
            <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
              Are you sure you want to export {recordCount} transactions? This
              will mark them as exported.
              {recordCount >= maxExportRecords && (
                <span className="block mt-2 text-xs sm:text-sm text-red-500">
                  Only the first {maxExportRecords} records will be exported due
                  to system limits.
                </span>
              )}
            </p>
            <div className="flex justify-end space-x-3 sm:space-x-4">
              <button
                onClick={closeConfirmDialog}
                className="px-3 sm:px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm sm:text-base hover:bg-gray-300 focus:ring-2 focus:ring-gray-400 transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmDownload}
                className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm sm:text-base hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 transition-colors duration-200"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-full mx-auto bg-white rounded-lg shadow-lg p-4 sm:p-6">
        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12">
            <div className="animate-spin rounded-full h-8 sm:h-10 w-8 sm:w-10 border-t-4 border-b-4 border-indigo-600"></div>
            <span className="mt-2 text-sm sm:text-base text-gray-600">
              Loading transactions...
            </span>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg my-4 sm:my-6">
            <p className="text-sm sm:text-base font-medium">{error}</p>
            <p className="text-xs sm:text-sm">
              This error will clear in 5 seconds.
            </p>
          </div>
        )}

        {/* Transactions Section */}
        {!loading && !error && (
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">
                Transactions
              </h2>
              {transactions.length > 0 && (
                <button
                  onClick={() => openConfirmDialog(handleDownloadTransactions)}
                  className="mt-3 sm:mt-0 px-4 sm:px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm sm:text-base hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 transition-colors duration-200 shadow-md"
                >
                  Export to Excel
                </button>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mb-4">
              Total Records: {totalTransactions} | Showing {transactions.length}{" "}
              (Page {transactionsPage})
            </p>
            {transactions.length > 0 ? (
              <>
                {/* Table for larger screens */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Number
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          GB
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created At
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {transactions.map((tx) => (
                        <tr
                          key={tx.id}
                          className="hover:bg-gray-50 transition-colors duration-150"
                        >
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatPhoneNumber(
                              tx.subscriber_number || tx.number || "N/A"
                            )}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {tx.gb || extractGB(tx.desc) || "N/A"}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                <div className="sm:hidden space-y-4">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-4 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200"
                    >
                      <p className="text-sm text-gray-900">
                        <span className="font-semibold">Number:</span>{" "}
                        {formatPhoneNumber(
                          tx.subscriber_number || tx.number || "N/A"
                        )}
                      </p>
                      <p className="text-sm text-gray-900 mt-2">
                        <span className="font-semibold">GB:</span>{" "}
                        {tx.gb || extractGB(tx.desc) || "N/A"}
                      </p>
                      <p className="text-sm text-gray-900 mt-2">
                        <span className="font-semibold">Created At:</span>{" "}
                        {tx.createdAt
                          ? new Date(tx.createdAt.toDate()).toLocaleString()
                          : "N/A"}
                      </p>
                    </div>
                  ))}
                </div>
                {/* Pagination */}
                <div className="flex flex-col items-center sm:flex-row sm:justify-between mt-6 space-y-3 sm:space-y-0">
                  <button
                    onClick={handlePrevPage}
                    disabled={transactionsPage === 1}
                    className={`w-full sm:w-auto px-4 sm:px-6 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                      transactionsPage === 1
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500"
                    }`}
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {transactionsPage}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={!hasMoreTransactions}
                    className={`w-full sm:w-auto px-4 sm:px-6 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                      !hasMoreTransactions
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500"
                    }`}
                  >
                    Next
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8 sm:py-12">
                <p className="text-base sm:text-lg text-gray-500">
                  No transactions found.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
