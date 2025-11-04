import React from "react";

const formatPhoneNumber = (number) => {
  if (!number) return "N/A";
  const cleaned = number.toString().replace(/^233/, "").trim();
  return cleaned.length === 9 ? `0${cleaned}` : cleaned || "N/A";
};

const getKey = (tx) => tx.externalRef || tx.id;

const UssdTransactionsTab = ({
  ussdTransactions, // ← from delivery_queue
  totalUssd,
  ussdPage,
  hasMoreUssd,
  loading,
  error,
  onPrevPage,
  onNextPage,
  onDownload,
}) => {
  return (
    <div className="mt-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
          USSD Transactions (Ready for Export)
        </h2>
        {ussdTransactions.length > 0 && (
          <button
            onClick={onDownload}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base shadow-md transition"
          >
            Download USSD (Excel)
          </button>
        )}
      </div>

      {/* Stats */}
      <p className="text-sm text-gray-600 mb-4">
        <strong>{totalUssd}</strong> transaction
        {totalUssd !== 1 ? "s" : ""} pending export | Showing{" "}
        <strong>{ussdTransactions.length}</strong> on page {ussdPage}
      </p>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-center text-red-600 font-medium">{error}</p>}

      {/* Transactions Grid */}
      {!loading && !error && ussdTransactions.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ussdTransactions.map((tx) => (
              <div
                key={getKey(tx)}
                className="p-4 bg-white rounded-lg shadow hover:shadow-lg transition-shadow border border-gray-100"
              >
                <p className="font-medium text-gray-900">
                  {formatPhoneNumber(tx.msisdn)}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-semibold">GB:</span> {tx.gig || "N/A"}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-semibold">Amount:</span> GH₵
                  {tx.amount || "N/A"}
                </p>
                {tx.externalRef && (
                  <p className="text-xs text-gray-500 mt-2 truncate">
                    Ref: {tx.externalRef}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-8">
            <button
              onClick={onPrevPage}
              disabled={ussdPage === 1}
              className={`px-5 py-2 rounded-lg font-medium transition ${
                ussdPage === 1
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              Previous
            </button>

            <span className="text-gray-700 font-medium">Page {ussdPage}</span>

            <button
              onClick={onNextPage}
              disabled={!hasMoreUssd}
              className={`px-5 py-2 rounded-lg font-medium transition ${
                !hasMoreUssd
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              Next
            </button>
          </div>
        </>
      ) : (
        !loading && (
          <div className="text-center py-12">
            <p className="text-lg text-gray-600">
              No pending USSD transactions for export.
            </p>
          </div>
        )
      )}
    </div>
  );
};

export default UssdTransactionsTab;
