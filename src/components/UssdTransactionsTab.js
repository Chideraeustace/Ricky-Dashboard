// components/UssdTransactionsTab.jsx
import React, { useMemo } from "react";

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

const getKey = (tx) => tx.externalRef || tx.id; // stable key

const UssdTransactionsTab = ({
  ussdTransactions,
  totalUssd,
  ussdPage,
  hasMoreUssd,
  loading,
  error,
  onPrevPage,
  onNextPage,
  onDownload,
}) => {
  const uniqueTx = useMemo(() => {
    const seen = new Set();
    return ussdTransactions.filter((tx) => {
      const k = getKey(tx);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [ussdTransactions]);

  return (
    <div className="mt-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
          Today's USSD Transactions
        </h2>
        {uniqueTx.length > 0 && (
          <button
            onClick={onDownload}
            className="mt-2 sm:mt-0 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base shadow-md"
          >
            Download USSD (Excel)
          </button>
        )}
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Total Raw Records: {totalUssd} | Unique on Page: {uniqueTx.length} (Page{" "}
        {ussdPage})
      </p>

      {loading && (
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      )}

      {error && <p className="text-center text-red-500">{error}</p>}

      {!loading && !error && uniqueTx.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {uniqueTx.map((tx) => (
              <div
                key={getKey(tx)}
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
              onClick={onPrevPage}
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
              onClick={onNextPage}
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
        !loading && (
          <p className="text-gray-600 text-center text-lg">
            No USSD transactions found.
          </p>
        )
      )}
    </div>
  );
};

export default UssdTransactionsTab;
