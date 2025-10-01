import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { Parser } from "@json2csv/plainjs";
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
    const unsubscribe = onSnapshot(
      collection(db, "teller_response"),
      (querySnapshot) => {
        const transactionsData = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        // Sort transactions by createdAt in descending order
        const sortedTransactions = transactionsData.sort((a, b) => {
          const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
          const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
          return dateB - dateA; // Most recent first
        });
        setTransactions(sortedTransactions);
        setFilteredTransactions(sortedTransactions);
        setLoading(false);
      },
      (err) => {
        setError("Failed to fetch transactions");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter transactions and count today's approved transactions
  useEffect(() => {
    let filtered = transactions;

    // Count today's approved transactions (not exported)
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of current day
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1); // Start of next day
    const todayApprovedCount = transactions.filter(
      (transaction) =>
        transaction.createdAt &&
        transaction.status?.toLowerCase() === "approved" &&
        transaction.createdAt.toDate() >= today &&
        transaction.createdAt.toDate() < tomorrow &&
        !transaction.exported
    ).length;
    setTodayTransactionCount(todayApprovedCount);

    // Filter by status (tab) or recent transactions
    if (activeTab === "recent") {
      filtered = filtered.filter(
        (transaction) =>
          transaction.createdAt &&
          transaction.status?.toLowerCase() === "approved" &&
          transaction.createdAt.toDate() >= today &&
          transaction.createdAt.toDate() < tomorrow &&
          !transaction.exported
      );
    } else if (activeTab !== "all") {
      filtered = filtered.filter(
        (transaction) => transaction.status?.toLowerCase() === activeTab
      );
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter((transaction) =>
        Object.values(transaction).some((value) =>
          value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Filter by r_switch
    if (rSwitchFilter) {
      filtered = filtered.filter(
        (transaction) =>
          transaction.r_switch?.toLowerCase() === rSwitchFilter.toLowerCase()
      );
    }

    // Sort filtered transactions by createdAt in descending order
    const sortedFiltered = [...filtered].sort((a, b) => {
      const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
      const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
      return dateB - dateA; // Most recent first
    });

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

  // Download transactions as CSV (approved or recent approved based on tab)
  const downloadCSV = async (rSwitch = "") => {
    try {
      let dataToExport = transactions;

      // If recent tab is active, only include approved transactions from today that are not exported
      if (activeTab === "recent") {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of current day
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1); // Start of next day
        dataToExport = dataToExport.filter(
          (transaction) =>
            transaction.createdAt &&
            transaction.status?.toLowerCase() === "approved" &&
            transaction.createdAt.toDate() >= today &&
            transaction.createdAt.toDate() < tomorrow &&
            !transaction.exported
        );
      } else {
        // Otherwise, filter by approved status
        dataToExport = dataToExport.filter(
          (t) => t.status?.toLowerCase() === "approved"
        );
      }

      if (rSwitch) {
        dataToExport = dataToExport.filter(
          (t) => t.r_switch?.toLowerCase() === rSwitch.toLowerCase()
        );
      }

      if (dataToExport.length === 0) {
        alert(
          activeTab === "recent"
            ? "No approved transactions from today found for the selected r_switch."
            : "No approved transactions found for the selected r_switch."
        );
        return;
      }

      const parser = new Parser({
        fields: [
          "code",
          "createdAt",
          "customer_id",
          "desc",
          "r_switch",
          "reason",
          "status",
          "subscriber_number",
          "transaction_id",
        ],
        transforms: [
          (item) => ({
            ...item,
            createdAt: formatDate(item.createdAt),
          }),
        ],
      });
      const csv = parser.parse(dataToExport);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download =
        activeTab === "recent"
          ? rSwitch
            ? `recent_approved_transactions_${rSwitch}.csv`
            : "recent_approved_transactions.csv"
          : rSwitch
          ? `approved_transactions_${rSwitch}.csv`
          : "approved_transactions.csv";
      link.click();
      URL.revokeObjectURL(link.href);

      // If in recent tab, mark the downloaded transactions as exported in Firestore
      if (activeTab === "recent") {
        await Promise.all(
          dataToExport.map((t) =>
            updateDoc(doc(db, "teller_response", t.id), { exported: true })
          )
        );
      }
    } catch (err) {
      console.error("Error generating CSV or updating documents:", err);
      alert("Failed to download CSV or update transactions");
    }
  };

  const statusClass = (status) => {
    switch (status) {
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

  // Get unique r_switch values for dropdown
  const uniqueRSwitches = [
    ...new Set(transactions.map((t) => t.r_switch).filter(Boolean)),
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
              onClick={() => downloadCSV(rSwitchFilter)}
              className="flex items-center justify-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-lg shadow-md hover:bg-blue-700 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
              disabled={
                activeTab === "recent"
                  ? filteredTransactions.length === 0
                  : transactions.filter(
                      (t) => t.status?.toLowerCase() === "approved"
                    ).length === 0
              }
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">
                {activeTab === "recent"
                  ? "Download Today's Approved CSV"
                  : "Download Approved CSV"}
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
                      {formatDate(transaction.createdAt)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {transaction.customer_id || "N/A"}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {transaction.r_switch || "N/A"}
                    </td>
                    <td className="py-3 px-4">{transaction.desc || "N/A"}</td>
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
                      {transaction.subscriber_number || "N/A"}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {transaction.transaction_id || "N/A"}
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
                      {formatDate(transaction.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={14} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">
                      Customer ID:
                    </span>
                    <span className="ml-auto text-right truncate">
                      {transaction.customer_id || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={14} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">
                      R Switch:
                    </span>
                    <span className="ml-auto text-right truncate">
                      {transaction.r_switch || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={14} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">Reason:</span>
                    <span className="ml-auto text-right truncate">
                      {transaction.desc || "N/A"}
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
                      {transaction.subscriber_number || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={14} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">
                      Transaction ID:
                    </span>
                    <span className="ml-auto text-right truncate">
                      {transaction.transaction_id || "N/A"}
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
