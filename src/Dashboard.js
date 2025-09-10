import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { Parser } from '@json2csv/plainjs';
import {
  Download,
  Search,
  Loader,
  XCircle,
  BarChart2,
  List,
} from 'lucide-react';

function Dashboard() {
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch transactions from Firestore
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'teller_response'));
        const transactionsData = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setTransactions(transactionsData);
        setFilteredTransactions(transactionsData);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch transactionss');
        setLoading(false);
      }
    };
    fetchTransactions();
  }, []);

  // Filter transactions based on search term
  useEffect(() => {
    const filtered = transactions.filter((transaction) =>
      Object.values(transaction).some((value) =>
        value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
    setFilteredTransactions(filtered);
  }, [searchTerm, transactions]);

  // Format timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp.toDate()).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  };

  // Download transactions as CSV
  const downloadCSV = () => {
    try {
      const parser = new Parser({
        fields: [
          'code',
          'createdAt',
          'customer_id',
          'desc',
          'r_switch',
          'reason',
          'status',
          'subscriber_number',
          'transaction_id',
        ],
        transforms: [
          (item) => ({
            ...item,
            createdAt: formatDate(item.createdAt),
          }),
        ],
      });
      const csv = parser.parse(filteredTransactions);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'transactions.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error('Error generating CSV:', err);
      alert('Failed to download CSV');
    }
  };

  const statusClass = (status) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen font-sans">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4 border-b pb-4 border-gray-200">
        <div className="flex items-center gap-2 text-gray-800">
          <BarChart2 className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl sm:text-3xl font-bold">Transaction Dashboard</h1>
        </div>
        <button
          onClick={downloadCSV}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl shadow-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={filteredTransactions.length === 0}
        >
          <Download className="w-4 h-4 sm:w-5 sm:h-5" />
          Download CSV
        </button>
      </div>

      <div className="mb-6 flex items-center bg-white rounded-xl shadow-sm border border-gray-300 overflow-hidden">
        <div className="p-2 text-gray-400">
          <Search className="w-5 h-5" />
        </div>
        <input
          type="text"
          placeholder="Search all transactions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 p-2 sm:p-3 focus:outline-none text-sm sm:text-base"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <XCircle className="w-5 h-5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col justify-center items-center h-64 text-gray-500">
          <Loader className="animate-spin h-10 w-10 text-blue-500" />
          <p className="mt-4 text-lg">Loading transactions...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col justify-center items-center h-64 text-red-500">
          <XCircle className="w-12 h-12" />
          <p className="mt-4 text-lg text-center font-medium">{error}</p>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <p className="text-base sm:text-lg">
            No transactions found. Try adjusting your search.
          </p>
        </div>
      ) : (
        <div className="shadow-lg rounded-xl overflow-hidden bg-white">
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr className="text-gray-600 text-xs uppercase tracking-wider font-semibold">
                  <th className="py-4 px-6 text-left">Created At</th>
                  <th className="py-4 px-6 text-left">Customer ID</th>
                  <th className="py-4 px-6 text-left">R Switch</th>
                  <th className="py-4 px-6 text-left">Reason</th>
                  <th className="py-4 px-6 text-left">Status</th>
                  <th className="py-4 px-6 text-left">Subscriber Number</th>
                  <th className="py-4 px-6 text-left">Transaction ID</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 text-sm text-gray-700">
                {filteredTransactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-4 px-6 whitespace-nowrap">{formatDate(transaction.createdAt)}</td>
                    <td className="py-4 px-6 whitespace-nowrap">{transaction.customer_id || 'N/A'}</td>
                    <td className="py-4 px-6 whitespace-nowrap">{transaction.r_switch || 'N/A'}</td>
                    <td className="py-4 px-6">{transaction.desc || 'N/A'}</td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${statusClass(transaction.status)}`}>
                        {transaction.status || 'N/A'}
                      </span>
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap">{transaction.subscriber_number || 'N/A'}</td>
                    <td className="py-4 px-6 whitespace-nowrap">{transaction.transaction_id || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden space-y-4 p-4">
            {filteredTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="grid grid-cols-1 gap-3 text-sm text-gray-700">
                  <div className="flex items-center gap-2">
                    <List size={16} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">Created At:</span>
                    <span className="ml-auto text-right">{formatDate(transaction.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={16} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">Customer ID:</span>
                    <span className="ml-auto text-right">{transaction.customer_id || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={16} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">R Switch:</span>
                    <span className="ml-auto text-right">{transaction.r_switch || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={16} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">Reason:</span>
                    <span className="ml-auto text-right">{transaction.desc || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={16} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">Status:</span>
                    <span className={`ml-auto px-3 py-1 rounded-full text-xs font-medium border ${statusClass(transaction.status)}`}>
                      {transaction.status || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={16} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">Subscriber Number:</span>
                    <span className="ml-auto text-right">{transaction.subscriber_number || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <List size={16} className="text-blue-500" />
                    <span className="font-semibold text-gray-900">Transaction ID:</span>
                    <span className="ml-auto text-right">{transaction.transaction_id || 'N/A'}</span>
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