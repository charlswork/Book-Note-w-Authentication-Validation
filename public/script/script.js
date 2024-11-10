async function markAsUnread(bookId) {
  try {
    const response = await fetch(`/books/markAsUnread/${bookId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();
    if (response.ok) {
      alert(result.message); // Notify user
      location.reload(); // Reload the page to reflect changes
    } else {
      alert("Error: " + result.message);
    }
  } catch (error) {
    console.error("Error marking book as unread:", error);
  }
}
document.addEventListener("DOMContentLoaded", function () {
  const dropdownButton = document.querySelector(".dropdown-button");
  const dropdownMenu = document.querySelector(".dropdown-menu");
  const sortRating = document.getElementById("sortRating");
  const sortRecency = document.getElementById("sortRecency");
  const sortCreatedAt = document.getElementById("sortCreatedAt");

  // Ensure books container exists
  const booksContainer = document.getElementById("books-container");

  if (!booksContainer) {
    console.error("Books container not found!");
    return;
  }

  // Toggle the dropdown visibility
  dropdownButton.addEventListener("click", function () {
    dropdownMenu.classList.toggle("open");
  });

  // Sort books by rating (in descending order)
  function sortBooksByRating() {
    const books = Array.from(booksContainer.querySelectorAll(".book-item"));

    books.sort((a, b) => {
      const ratingA = parseFloat(a.getAttribute("data-rating"));
      const ratingB = parseFloat(b.getAttribute("data-rating"));
      return ratingB - ratingA; // Descending order
    });

    booksContainer.innerHTML = ""; // Clear current books
    books.forEach((book) => booksContainer.appendChild(book)); // Append sorted books
  }

  // Sort books by recency (updated_at in descending order)
  function sortBooksByRecency() {
    const books = Array.from(booksContainer.querySelectorAll(".book-item"));

    books.sort((a, b) => {
      const dateA = new Date(a.getAttribute("data-updated-at"));
      const dateB = new Date(b.getAttribute("data-updated-at"));
      return dateB - dateA; // Descending order (most recent first)
    });

    booksContainer.innerHTML = ""; // Clear current books
    books.forEach((book) => booksContainer.appendChild(book)); // Append sorted books
  }

  // Sort books by creation date (created_at in descending order)
  function sortBooksByCreatedAt() {
    const books = Array.from(booksContainer.querySelectorAll(".book-item"));

    books.sort((a, b) => {
      const dateA = new Date(a.getAttribute("data-created-at"));
      const dateB = new Date(b.getAttribute("data-created-at"));
      return dateB - dateA; // Descending order (newer books first)
    });

    booksContainer.innerHTML = ""; // Clear current books
    books.forEach((book) => booksContainer.appendChild(book)); // Append sorted books
  }

  // Event listeners for sorting options
  sortRating.addEventListener("click", function () {
    sortBooksByRating();
    dropdownMenu.classList.remove("open"); // Close the dropdown after selection
  });

  sortRecency.addEventListener("click", function () {
    sortBooksByRecency();
    dropdownMenu.classList.remove("open"); // Close the dropdown after selection
  });

  sortCreatedAt.addEventListener("click", function () {
    sortBooksByCreatedAt();
    dropdownMenu.classList.remove("open"); // Close the dropdown after selection
  });

  // Close dropdown if clicked outside of it
  window.addEventListener("click", function (event) {
    if (!dropdownButton.contains(event.target)) {
      dropdownMenu.classList.remove("open");
    }
  });
});
