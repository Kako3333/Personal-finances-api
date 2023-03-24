const express = require('express');
const mongoose = require('mongoose');

const app = express();

const categorySchema = new mongoose.Schema({
  name: String,
  default: Boolean,
});

// Defining the finance transaction schema
const transactionSchema = new mongoose.Schema({
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['Processing', 'Completed'],
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

// Creating the category model
const Category = mongoose.model('Category', categorySchema);

// Creating the transaction model
const Transaction = mongoose.model('Transaction', transactionSchema);


// Route to create a new finance category
app.post('/categories', async (req, res) => {
  try {
    const { name, isDefault } = req.body;
    const category = new Category({name, default: isDefault} );
    await category.save();
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Route to get all finance categories
app.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to get a specific finance category by ID
app.get('/categories/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to update a specific finance category by ID
app.put('/categories/:id', async (req, res) => {
  try {
    const { name, basic } = req.body;
    const category = await Category.findByIdAndUpdate(req.params.id, { name, basic }, { new: true });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to delete a specific finance category by ID
app.delete('/categories/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    if (category.default) {
      return res.status(400).json({ error: 'Cannot delete default category' });
    }
    await Transaction.updateMany({ category: category._id }, { category: null });
    await category.remove();
    res.json({ message: 'Category deleted successfully' });
  } catch(error) {
    res.status(500).json({ error: error.message });
  }
});


// kategoriebshi xarjebis damateba da sortireba ver movaswari kodi ari daumtavrebeli magram am etapze api mainc mushaobs, shegidzliat kategoriebis damateba washla, da id-is mixebvit modzebna.
