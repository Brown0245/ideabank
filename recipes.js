export const recipes = {
      'Pancakes': ['flour', 'milk', 'eggs', 'baking powder', 'butter', 'maple syrup'],
      'Scrambled eggs': ['eggs', 'butter', 'milk'],
      'French toast': ['bread', 'eggs', 'milk', 'cinnamon', 'butter', 'maple syrup'],
      'Oatmeal': ['oats', 'milk', 'bananas', 'cinnamon'],
      'Yogurt bowl': ['yogurt', 'granola', 'berries'],
      'Avocado toast': ['bread', 'avocados', 'lemon'],
      'Grilled cheese': ['bread', 'cheddar cheese', 'butter'],
      'Chicken salad': ['chicken breast', 'lettuce', 'tomatoes', 'cucumber', 'olive oil', 'lemon'],
      'Tuna sandwich': ['canned tuna', 'bread', 'mayonnaise', 'celery'],
      'Quesadillas': ['tortillas', 'cheddar cheese', 'bell peppers', 'onions'],
      'Spaghetti bolognese': ['spaghetti', 'ground beef', 'canned tomatoes', 'onions', 'garlic', 'olive oil', 'parmesan'],
      'Tacos': ['tortillas', 'ground beef', 'taco seasoning', 'lettuce', 'tomatoes', 'cheddar cheese', 'sour cream'],
      'Chicken stir fry': ['chicken breast', 'rice', 'broccoli', 'bell peppers', 'soy sauce', 'garlic', 'ginger', 'olive oil'],
      'Vegetable stir fry': ['rice', 'broccoli', 'bell peppers', 'carrots', 'soy sauce', 'garlic', 'ginger', 'olive oil'],
      'Chicken curry': ['chicken breast', 'rice', 'coconut milk', 'curry powder', 'onions', 'garlic', 'ginger'],
      'Chili': ['ground beef', 'kidney beans', 'canned tomatoes', 'onions', 'garlic', 'chili powder'],
      'Salmon and rice': ['salmon', 'rice', 'broccoli', 'lemon', 'olive oil'],
      'Burgers': ['ground beef', 'burger buns', 'lettuce', 'tomatoes', 'onions', 'cheddar cheese'],
      'Pizza': ['pizza dough', 'pizza sauce', 'mozzarella', 'basil'],
      'Pesto pasta': ['pasta', 'pesto', 'cherry tomatoes', 'parmesan'],
      'Lentil soup': ['lentils', 'vegetable broth', 'carrots', 'celery', 'onions', 'garlic', 'canned tomatoes']
    };

export function groceryList(dishes, extras = "") {
  return [...new Set([...dishes.flatMap(name => recipes[name] || []), ...extras.split(/[,\n]/).map(s => s.trim().toLowerCase()).filter(Boolean)])].sort();
}
