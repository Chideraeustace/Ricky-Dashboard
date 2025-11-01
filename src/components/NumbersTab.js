// components/NumbersTab.jsx
import React from "react";

const formatPhoneNumber = (number) => {
  if (!number) return "N/A";
  const cleaned = number.toString().replace(/^233/, "").trim();
  return cleaned.length === 9 ? `0${cleaned}` : cleaned || "N/A";
};

const NumbersTab = ({
  numbers,
  totalNumbers,
  numbersPage,
  hasMoreNumbers,
  loading,
  error,
  onPrevPage,
  onNextPage,
  onDownload,
}) => {
  return (
    <div className="mt-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
          New Numbers
        </h2>
        {numbers.length > 0 && (
          <button
            onClick={onDownload}
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

      {loading && (
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      )}

      {error && <p className="text-center text-red-500">{error}</p>}

      {!loading && !error && numbers.length > 0 ? (
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
              onClick={onPrevPage}
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
              onClick={onNextPage}
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
        !loading && (
          <p className="text-gray-600 text-center text-lg">No numbers found.</p>
        )
      )}
    </div>
  );
};

export default NumbersTab;
