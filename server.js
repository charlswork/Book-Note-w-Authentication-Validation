const express = require("express");
const app = express();
const { Client } = require("pg");
const path = require("path");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const session = require("express-session"); // Import express-session
const axios = require("axios"); // To make API requests to Open Library

app.use(express.json());
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Configure session middleware
app.use(
  session({
    secret: "your_secret_key", // Replace with a strong secret key
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true if using HTTPS
  })
);

// Database connection
const client = new Client({
  user: "postgres",
  host: "localhost",
  database: "postgresql",
  password: "2002356_Charles",
  port: 5432,
});

client
  .connect()
  .then(() => console.log("Connected to the database"))
  .catch((err) => console.error("Error connecting to the database:", err));

// Render registration form
app.get("/registration", (req, res) => {
  res.render("registration");
});

// Handle user registration
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `
      INSERT INTO users (username, email, password)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const values = [username, email, hashedPassword];
    const result = await client.query(query, values);

    res.send("User registered successfully!");
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).send("Error registering user");
  }
});

// Render login form
app.get("/login", (req, res) => {
  res.render("login");
});

// Handle user login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await client.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];

    if (user) {
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (passwordMatch) {
        // Set session with user ID on successful login
        req.session.userId = user.user_id;
        return res.redirect("/home");
      } else {
        res.send("Incorrect password");
      }
    } else {
      res.send("User not found");
    }
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).send("Error logging in");
  }
});

// Middleware to check if the user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.redirect("/login"); // Redirect to login if not authenticated
  }
}

// Protected route: Home page, accessible only if logged in
// app.get("/home", isAuthenticated, (req, res) => {
//   res.render("home", { message: "Welcome to the home page!" });
// });

// Function to fetch book details from Open Library API
const fetchBooksFromOpenLibrary = async (query = "JavaScript") => {
  try {
    const response = await axios.get(
      `https://openlibrary.org/search.json?q=${query}&limit=10`
    );

    // Return essential book details
    return response.data.docs.map((book) => ({
      title: book.title,
      author: book.author_name ? book.author_name.join(", ") : "Unknown",
      coverUrl: book.cover_i
        ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`
        : null,
    }));
  } catch (error) {
    console.error("Error fetching books:", error.message);
    return [];
  }
};
app.get("/home", isAuthenticated, async (req, res) => {
  const userId = req.session.userId;

  try {
    // Fetch books from Open Library API
    const books = await fetchBooksFromOpenLibrary("JavaScript");

    // Insert only new books into the database
    const insertPromises = books.map(async (book) => {
      const checkQuery = `SELECT * FROM books WHERE title = $1 AND author = $2`;
      const existingBook = await client.query(checkQuery, [
        book.title,
        book.author,
      ]);

      if (existingBook.rows.length === 0) {
        const insertQuery = `
          INSERT INTO books (title, author, cover_url, created_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        `;
        await client.query(insertQuery, [
          book.title,
          book.author,
          book.coverUrl,
        ]);
      }
    });

    await Promise.all(insertPromises);

    // Retrieve all books with the user's read status
    const dbBooksQuery = `
      SELECT b.book_id, b.title, b.author, b.cover_url,
             COALESCE(ub.read, FALSE) AS read
      FROM books AS b
      LEFT JOIN user_books AS ub ON b.book_id = ub.book_id AND ub.user_id = $1
      ORDER BY b.title ASC
    `;
    const dbBooksResult = await client.query(dbBooksQuery, [userId]);
    const dbBooks = dbBooksResult.rows;

    // Retrieve all users for profile display
    const usersQuery = `
      SELECT user_id, username FROM users
    `;
    const { rows: users } = await client.query(usersQuery);

    // Render the home view with the updated book list and user profiles
    res.render("home", { books: dbBooks, users });
  } catch (error) {
    console.error("Error in home route:", error.message);
    res.status(500).send("Error fetching books");
  }
});

// Route to fetch and display all books, adding new ones from API if needed
// app.get("/home", isAuthenticated, async (req, res) => {
//   try {
//     const books = await fetchBooksFromOpenLibrary("JavaScript");

//     // Insert only new books
//     const insertPromises = books.map(async (book) => {
//       const checkQuery = `SELECT * FROM books WHERE title = $1 AND author = $2`;
//       const existingBook = await client.query(checkQuery, [
//         book.title,
//         book.author,
//       ]);

//       if (existingBook.rows.length === 0) {
//         const insertQuery = `
//             INSERT INTO books (title, author, cover_url, created_at)
//             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
//           `;
//         await client.query(insertQuery, [
//           book.title,
//           book.author,
//           book.coverUrl,
//         ]);
//       }
//     });

//     await Promise.all(insertPromises);

//     const dbBooks = await client.query("SELECT * FROM books");
//     res.render("home", { books: dbBooks.rows });
//   } catch (error) {
//     console.error("Error in home route:", error.message);
//     res.status(500).send("Error fetching books");
//   }
// });

// Route to handle book click and navigate to book details page
app.get("/book/read/:bookId", isAuthenticated, async (req, res) => {
  const { bookId } = req.params;
  const userId = req.session.userId;

  try {
    // Retrieve the book details along with the user's read status
    const bookDetailsQuery = `
          SELECT b.*, ub.read, ub.rating, ub.review, ub.note
FROM books b
LEFT JOIN user_books ub ON b.book_id = ub.book_id AND ub.user_id = $1
WHERE b.book_id = $2;


      `;
    const bookDetailsResult = await client.query(bookDetailsQuery, [
      userId,
      bookId,
    ]);

    const book = bookDetailsResult.rows[0];

    if (!book) {
      return res.status(404).send("Book not found.");
    }

    // Render the book details page with book data, including read status
    res.render("bookDetails", { book });
  } catch (error) {
    console.error("Error fetching or storing book details:", error.message);
    res.status(500).send("Error displaying book details");
  }
});

app.post("/book/updateStatus/:bookId", isAuthenticated, async (req, res) => {
  const { bookId } = req.params;
  const userId = req.session.userId;

  try {
    // Check if the user has an existing record for the book in user_books table
    const checkQuery = `SELECT * FROM user_books WHERE user_id = $1 AND book_id = $2`;
    const existingRecord = await client.query(checkQuery, [userId, bookId]);

    if (existingRecord.rows.length > 0) {
      // Update the read status to TRUE if the record exists
      const updateQuery = `
          UPDATE user_books
          SET read = TRUE
          WHERE user_id = $1 AND book_id = $2
        `;
      await client.query(updateQuery, [userId, bookId]);
    } else {
      // If no record exists, insert a new one with read status as TRUE
      const insertQuery = `
          INSERT INTO user_books (user_id, book_id, read)
          VALUES ($1, $2, TRUE)
        `;
      await client.query(insertQuery, [userId, bookId]);
    }

    res.redirect(`/book/read/${bookId}`); // Redirect to book details page after update
  } catch (error) {
    console.error("Error updating book status:", error.message);
    res.status(500).send("Error updating book status");
  }
});

app.post("/book/addReview/:bookId", isAuthenticated, async (req, res) => {
  const { bookId } = req.params;
  const { review, rating, note } = req.body;
  const userId = req.session.userId;

  try {
    // Check if the user has a record for this book
    const checkQuery = `SELECT * FROM user_books WHERE user_id = $1 AND book_id = $2`;
    const existingRecord = await client.query(checkQuery, [userId, bookId]);

    if (existingRecord.rows.length > 0) {
      // Update the review and rating if the record exists
      const updateQuery = `
          UPDATE user_books
          SET review = $1, rating = $2
          WHERE user_id = $3 AND book_id = $4
        `;
      await client.query(updateQuery, [review, rating, userId, bookId]);
    } else {
      // If no record exists, insert a new one with review and rating
      const insertQuery = `
          INSERT INTO user_books (user_id, book_id, review, rating, note)
          VALUES ($1, $2, $3, $4, $5)
        `;
      await client.query(insertQuery, [userId, bookId, review, rating, note]);
    }

    res.redirect(`/book/read/${bookId}`); // Redirect back to book details page after updating
  } catch (error) {
    console.error("Error adding review and rating:", error.message);
    res.status(500).send("Error adding review and rating");
  }
});

// show all the book that read in my allBookread
// Route to fetch all books marked as "read" by the user
app.get("/books/read", isAuthenticated, async (req, res) => {
  const userId = req.session.userId;

  try {
    // Query to fetch all books the user has marked as read
    const readBooksQuery = `
      SELECT b.book_id, b.title, b.author, b.cover_url, ub.review, ub.rating, ub.created_at
      FROM books b
      JOIN user_books ub ON b.book_id = ub.book_id
      WHERE ub.user_id = $1 AND ub.read = true
      ORDER BY ub.created_at DESC
    `;
    const result = await client.query(readBooksQuery, [userId]);
    const readBooks = result.rows;

    // Render the allBookRead template with the read books data
    res.render("allBookRead", { readBooks });
  } catch (error) {
    console.error("Error fetching read books:", error.message);
    res.status(500).send("Error fetching read books");
  }
});

app.get("/user/:userId", isAuthenticated, async (req, res) => {
  const { userId } = req.params;

  try {
    // Retrieve books marked as "read" by the specified user
    const userBooksQuery = `
      SELECT b.title, b.author, b.cover_url, ub.review, ub.rating
      FROM user_books ub
      JOIN books b ON ub.book_id = b.book_id
      WHERE ub.user_id = $1 AND ub.read = TRUE
    `;
    const { rows: userBooks } = await client.query(userBooksQuery, [userId]);

    // Get the username for display
    const userQuery = `SELECT username FROM users WHERE user_id = $1`;
    const { rows } = await client.query(userQuery, [userId]);
    const username = rows[0]?.username || "User";

    res.render("user-books", { userBooks, username });
  } catch (error) {
    console.error("Error fetching user books:", error.message);
    res.status(500).send("Error displaying user books");
  }
});

// app.get("/books/userBooksRead", isAuthenticated, async (req, res) => {
//   const userId = req.session.userId; // Use session-stored userId
//   try {
//     const result = await client.query(
//       `
//            SELECT b.title, b.author, b.cover_url, ub.review, ub.rating, b.book_id, ub.updated_at
//       FROM books AS b
//       JOIN user_books AS ub ON b.book_id = ub.book_id
//       WHERE ub.user_id = $1 AND ub.read = TRUE
//       `,
//       [userId]
//     );

//     // Pass the books data to your EJS view
//     res.render("userBooks", { books: result.rows });
//   } catch (error) {
//     console.error("Error fetching user books:", error.message);
//     res.status(500).send("Error retrieving user books");
//   }
// });

app.get("/books/userBooksRead", isAuthenticated, async (req, res) => {
  const userId = req.session.userId; // Use session-stored userId
  
  // Extract the 'sort' and 'order' query parameters (defaults to 'updated_at' and 'desc' if not provided)
  const { sort = 'updated_at', order = 'desc' } = req.query;

  // Validate sort column to prevent SQL injection
  const validSortColumns = ['rating', 'created_at', 'updated_at'];
  if (!validSortColumns.includes(sort)) {
    return res.status(400).send('Invalid sort parameter');
  }

  // Validate order direction to ensure it's either 'asc' or 'desc'
  const validOrderDirections = ['asc', 'desc'];
  if (!validOrderDirections.includes(order)) {
    return res.status(400).send('Invalid order parameter');
  }

  try {
    // Construct the SQL query with dynamic sorting
    const dbBooksQuery = `
      SELECT b.title, b.author, b.cover_url, ub.review, ub.rating, b.book_id, ub.updated_at, ub.created_at
      FROM books AS b
      JOIN user_books AS ub ON b.book_id = ub.book_id
      WHERE ub.user_id = $1 AND ub.read = TRUE
      ORDER BY ub.${sort} ${order} -- Dynamic sorting by chosen column and order
    `;
    const result = await client.query(dbBooksQuery, [userId]);

    // Pass the books data to your EJS view
    res.render("userBooks", { books: result.rows });
  } catch (error) {
    console.error("Error fetching user books:", error.message);
    res.status(500).send("Error retrieving user books");
  }
});

app.post("/books/markAsUnread/:bookId", isAuthenticated, async (req, res) => {
  const { bookId } = req.params;
  const userId = req.session.userId;

  try {
    const updateQuery = `
      UPDATE user_books
      SET read = FALSE
      WHERE user_id = $1 AND book_id = $2
    `;
    await client.query(updateQuery, [userId, bookId]);
    res.json({ message: "Book removed from your list" });
  } catch (error) {
    console.error("Error marking book as unread:", error.message);
    res.status(500).send("Error marking book as unread");
  }
});

// Server configuration
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}/login`);
});
