import { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  query,
} from "firebase/firestore";
import { db } from "./firebase";
import * as XLSX from "xlsx";
import {
  Download,
  Search,
  Loader,
  XCircle,
  BarChart2,
  List,
} from "lucide-react";

function Dashboard() {
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [todayTransactionCount, setTodayTransactionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [rSwitchFilter, setRSwitchFilter] = useState("");

  // Fetch transactions from Firestore in real-time
  useEffect(() => {
    const transactionsCollectionRef = collection(db, "teller_response");
    const q = query(transactionsCollectionRef);
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const uniqueTransIds = new Set();
        const transactionsData = querySnapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((transaction) => {
            const transId = transaction.transid || transaction.transaction_id;
            if (transId) {
              if (uniqueTransIds.has(transId)) {
                return false; // Skip duplicates
              }
              uniqueTransIds.add(transId);
              return true;
            }
            return true; // Include transactions without transId
          });
        console.log("Raw unique transactions:", transactionsData);
        setTransactions(transactionsData);
        setFilteredTransactions(transactionsData);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore fetch error:", err);
        setError("Failed to fetch transactions");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Filter transactions and count today's approved transactions
  useEffect(() => {
    let filtered = transactions;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const todayApprovedCount = transactions.filter(
      (transaction) =>
        (transaction.createdAt || transaction.purchasedAt) &&
        transaction.status?.toLowerCase() === "approved" &&
        (transaction.createdAt || transaction.purchasedAt).toDate() >= today &&
        (transaction.createdAt || transaction.purchasedAt).toDate() <
          tomorrow &&
        !transaction.exported
    ).length;
    setTodayTransactionCount(todayApprovedCount);

    if (activeTab === "recent") {
      filtered = filtered.filter(
        (transaction) =>
          (transaction.createdAt || transaction.purchasedAt) &&
          transaction.status?.toLowerCase() === "approved" &&
          (transaction.createdAt || transaction.purchasedAt).toDate() >=
            today &&
          (transaction.createdAt || transaction.purchasedAt).toDate() <
            tomorrow &&
          !transaction.exported
      );
    } else if (activeTab !== "all") {
      filtered = filtered.filter(
        (transaction) => transaction.status?.toLowerCase() === activeTab
      );
    }

    if (searchTerm) {
      filtered = filtered.filter((transaction) =>
        Object.values(transaction).some((value) =>
          value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    if (rSwitchFilter) {
      filtered = filtered.filter(
        (transaction) =>
          transaction.r_switch?.toLowerCase() === rSwitchFilter.toLowerCase() ||
          transaction.provider?.toLowerCase() === rSwitchFilter.toLowerCase()
      );
    }

    const sortedFiltered = [...filtered].sort((a, b) => {
      const dateA =
        a.createdAt || a.purchasedAt
          ? (a.createdAt || a.purchasedAt).toDate()
          : new Date(0);
      const dateB =
        b.createdAt || b.purchasedAt
          ? (b.createdAt || b.purchasedAt).toDate()
          : new Date(0);
      return dateB - dateA;
    });

    console.log("Final filtered transactions:", sortedFiltered);
    setFilteredTransactions(sortedFiltered);
  }, [searchTerm, transactions, activeTab, rSwitchFilter]);

  // Format timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp.toDate()).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  };

  // Derive GB from desc if gb is missing
  const getGB = (transaction) => {
    if (transaction.gb) return transaction.gb;
    if (transaction.desc) {
      const match = transaction.desc.match(/(\d+\.?\d*)\s*(GB|MB)/i);
      if (match) {
        const value = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        return unit === "GB" ? value : value / 1024; // Convert MB to GB
      }
    }
    return "N/A";
  };

  // Download transactions as Excel
  const downloadExcel = async (rSwitch = "") => {
    try {
      let dataToExport = transactions;

      if (activeTab === "recent") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        dataToExport = dataToExport.filter(
          (transaction) =>
            (transaction.createdAt || transaction.purchasedAt) &&
            transaction.status?.toLowerCase() === "approved" &&
            (transaction.createdAt || transaction.purchasedAt).toDate() >=
              today &&
            (transaction.createdAt || transaction.purchasedAt).toDate() <
              tomorrow &&
            !transaction.exported
        );
      } else {
        dataToExport = dataToExport.filter(
          (t) => t.status?.toLowerCase() === "approved"
        );
      }

      if (rSwitch) {
        dataToExport = dataToExport.filter(
          (t) =>
            t.r_switch?.toLowerCase() === rSwitch.toLowerCase() ||
            t.provider?.toLowerCase() === rSwitch.toLowerCase()
        );
      }

      console.log("Data to export after filtering:", dataToExport);
      if (dataToExport.length === 0) {
        alert(
          activeTab === "recent"
            ? "No approved transactions from today found for the selected r_switch."
            : "No approved transactions found for the selected r_switch."
        );
        return;
      }

      const excelData = dataToExport.map((t) => ({
        number: t.number || t.subscriber_number || "N/A",
        gb: getGB(t),
      }));

      console.log("Excel data:", excelData);

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");

      const excelBuffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });
      const blob = new Blob([excelBuffer], {
        type: "application/octet-stream",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download =
        activeTab === "recent"
          ? rSwitch
            ? `recent_approved_transactions_${rSwitch}.xlsx`
            : "recent_approved_transactions.xlsx"
          : rSwitch
          ? `approved_transactions_${rSwitch}.xlsx`
          : "approved_transactions.xlsx";
      link.click();
      URL.revokeObjectURL(link.href);

      if (activeTab === "recent") {
        await Promise.all(
          dataToExport.map((t) =>
            updateDoc(doc(db, "teller_response", t.id), { exported: true })
          )
        );
      }
    } catch (err) {
      console.error("Error generating Excel or updating documents:", err);
      alert("Failed to download Excel or update transactions");
    }
  };

  const statusClass = (status) => {
    switch (status?.toLowerCase()) {
      case "approved":
        return "bg-green-100 text-green-800 border-green-200";
      case "failed":
        return "bg-red-100 text-red-800 border-red-200";
      case "declined":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const uniqueRSwitches = [
    ...new Set(
      transactions.map((t) => t.r_switch || t.provider).filter(Boolean)
    ),
  ];

  return (
    <div className="container mx-auto p-3 sm:p-6 lg:p-8 bg-gray-50 min-h-screen font-sans">
      <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6 border-b pb-3 sm:pb-4 border-gray-200">
        <div className="flex items-center justify-between gap-2 text-gray-800 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">
              Transaction Dashboard
            </h1>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <select
              value={rSwitchFilter}
              onChange={(e) => setRSwitchFilter(e.target.value)}
              className="w-full sm:w-auto bg-white border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Networks</option>
              {uniqueRSwitches.map((rSwitch) => (
                <option key={rSwitch} value={rSwitch}>
                  {rSwitch}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setRSwitchFilter("");
                setSearchTerm("");
                setActiveTab("all");
              }}
              className="bg-gray-500 text-white px-3 py-2 rounded-lg text-sm"
            >
              Reset Filters
            </button>
            <button
              onClick={() => downloadExcel(rSwitchFilter)}
              className="flex items-center justify-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-lg shadow-md hover:bg-blue-700 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
              disabled={
                loading ||
                (activeTab === "recent" && filteredTransactions.length === 0)
              }
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">
                {activeTab === "recent"
                  ? "Download Today's Approved Excel"
                  : "Download Approved Excel"}
              </span>
              <span className="sm:hidden">Download</span>
            </button>
          </div>
        </div>

        <div className="flex overflow-x-auto border-b border-gray-200 scrollbar-thin">
          {["all", "recent", "approved", "failed", "declined"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-xs sm:text-sm font-medium capitalize border-b-2 whitespace-nowrap ${
                activeTab === tab
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab === "all"
                ? "All"
                : tab === "recent"
                ? `Today's Approved (${todayTransactionCount})`
                : tab}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 sm:mb-6 flex items-center bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
        <div className="p-2 text-gray-400">
          <Search className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <input
          type="text"
          placeholder="Search transactions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 p-2 text-sm focus:outline-none"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col justify-center items-center h-64 text-gray-500">
          <Loader className="animate-spin h-8 w-8 sm:h-10 sm:w-10 text-blue-500" />
          <p className="mt-3 text-sm sm:text-lg">Loading transactions...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col justify-center items-center h-64 text-red-500">
          <XCircle className="w-10 h-10 sm:w-12 sm:h-12" />
          <p className="mt-3 text-sm sm:text-lg text-center font-medium">
            {error}
          </p>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-center py-8 sm:py-10 text-gray-500">
          <p className="text-sm sm:text-lg">
            No transactions found. Try adjusting your search or filters.
          </p>
        </div>
      ) : (
        <div className="shadow-lg rounded-lg overflow-hidden bg-white">
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr className="text-gray-600 text-xs uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4 text-left">Created At</th>
                  <th className="py-3 px-4 text-left">Customer ID</th>
                  <th className="py-3 px-4 text-left">R Switch</th>
                  <th className="py-3 px-4 text-left">Reason</th>
                  <th className="py-3 px-4 text-left">Status</th>
                  <th className="py-3 px-4 text-left">Subscriber Number</th>
                  <th className="py-3 px-4 text-left">Transaction ID</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 text-sm text-gray-700">
                {filteredTransactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      {formatDate(
                        transaction.createdAt || transaction.purchasedAt
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {transaction.customer_id || transaction.userId || "N/A"}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {transaction.r_switch || transaction.provider || "N/A"}
                    </td>
                    <td className="py-3 px-4">
                      {transaction.desc || transaction.reason || "N/A"}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${statusClass(
                          transaction.status
                        )}`}
                      >
                        {transaction.status || "N/A"}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {transaction.subscriber_number ||
                        transaction.number ||
                        "N/A"}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {transaction.transaction_id ||
                        transaction.transid ||
                        "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden space-y-3 p-3">
            {filteredTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="grid grid-cols-1 gap-2 text-xs text-gray-700">
                  <div className="flex items-center gap-2">
                    <List size={14} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">
                      Created At:
                    </span>
                    <span className="ml-auto text-right truncate">
                      {formatDate(
                        transaction.createdAt || transaction.purchasedAt
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={14} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">
                      Customer ID:
                    </span>
                    <span className="ml-auto text-right truncate">
                      {transaction.customer_id || transaction.userId || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={14} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">
                      R Switch:
                    </span>
                    <span className="ml-auto text-right truncate">
                      {transaction.r_switch || transaction.provider || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={14} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">Reason:</span>
                    <span className="ml-auto text-right truncate">
                      {transaction.desc || transaction.reason || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={14} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">Status:</span>
                    <span
                      className={`ml-auto px-2 py-1 rounded-full text-xs font-medium border ${statusClass(
                        transaction.status
                      )}`}
                    >
                      {transaction.status || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={14} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">
                      Subscriber Number:
                    </span>
                    <span className="ml-auto text-right truncate">
                      {transaction.subscriber_number ||
                        transaction.number ||
                        "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={14} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">
                      Transaction ID:
                    </span>
                    <span className="ml-auto text-right truncate">
                      {transaction.transaction_id ||
                        transaction.transid ||
                        "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
