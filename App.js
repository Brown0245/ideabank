import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { groceryList, recipes } from './recipes';
import { generateMeal, restoreGeneratedRecipes } from './meal-api.mjs';

const key = 'menu-planner-v1';
export default function App() {
  const [tab, setTab] = useState('Meals');
  const [query, setQuery] = useState('');
  const [dishes, setDishes] = useState([]);
  const [extras, setExtras] = useState('');
  const [checked, setChecked] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState({});
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [notice, setNotice] = useState('');
  const availableRecipes = useMemo(() => ({ ...recipes, ...generated }), [generated]);
  useEffect(() => {
    AsyncStorage.getItem(key).then(raw => {
      if (!raw) return;
      const data = JSON.parse(raw);
      const restored = restoreGeneratedRecipes(data.generated);
      setGenerated(restored);
      if (Array.isArray(data.dishes)) setDishes(data.dishes.filter(name => typeof name === 'string' && (Object.hasOwn(recipes, name) || Object.hasOwn(restored, name))));
      if (typeof data.extras === 'string') setExtras(data.extras);
      if (Array.isArray(data.checked)) setChecked(data.checked.filter(item => typeof item === 'string'));
    }).catch(() => setError('Could not load saved meals. You can still plan this session.')).finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(key, JSON.stringify({ dishes, extras, checked, generated })).catch(() => setError('Could not save changes on this device.'));
  }, [dishes, extras, checked, generated, loaded]);
  const groceries = useMemo(() => groceryList(dishes, extras, availableRecipes), [dishes, extras, availableRecipes]);
  const matches = Object.keys(availableRecipes).filter(name => name.toLowerCase().includes(query.trim().toLowerCase()));
  async function lookupMeal() {
    if (generating || !query.trim()) return;
    setGenerating(true);
    setAiError('');
    setNotice('');
    let baseUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!baseUrl && Platform.OS === 'web') {
      baseUrl = __DEV__ ? `${window.location.protocol}//${window.location.hostname}:3001` : window.location.origin;
    }
    try {
      const recipe = await generateMeal(query, { baseUrl });
      setGenerated(current => ({ ...current, [recipe.name]: recipe.ingredients }));
      setDishes(current => current.includes(recipe.name) ? current : [...current, recipe.name]);
      setNotice(`Added ${recipe.name}. Review the AI-suggested ingredients below.`);
      setQuery('');
      setTab('Groceries');
    } catch (error) { setAiError(error.message || 'Could not generate this meal. Please try again.'); }
    finally { setGenerating(false); }
  }
  function toggleDish(name) {
    setDishes(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]);
  }
  function reset() {
    if (generating) return;
    const clear = () => { setDishes([]); setExtras(''); setChecked([]); setNotice(''); };
    if (Platform.OS === 'web') {
      if (window.confirm('Clear your selected dishes, extra ingredients and checked items?')) clear();
      return;
    }
    Alert.alert('Start a new grocery list?', 'This clears your selected dishes, extra ingredients and checked items.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear list', style: 'destructive', onPress: clear },
    ]);
  }
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.eyebrow}>MENU PLANNER</Text>
        <Text style={styles.title}>What’s cooking?</Text>
        <Text style={styles.subtitle}>Pick your dishes. We’ll make the grocery list.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}
        <View style={styles.tabs}>
          {['Meals', 'Groceries'].map(name => <Pressable key={name} accessibilityRole="tab" aria-selected={tab === name} accessibilityState={{ selected: tab === name }} onPress={() => setTab(name)} style={[styles.tab, tab === name && styles.activeTab]}>
            <Text style={[styles.tabText, tab === name && styles.activeText]}>{name} · {name === 'Meals' ? dishes.length : groceries.length}</Text>
          </Pressable>)}
        </View>
        {!loaded ? <Text style={styles.subtitle}>Loading your planner…</Text> : tab === 'Meals' ? <>
          <TextInput accessibilityLabel="Find a dish" placeholder="What would you like to make?" value={query} onChangeText={value => { setQuery(value); setAiError(''); }} maxLength={160} onSubmitEditing={lookupMeal} returnKeyType="search" style={styles.input} autoCorrect={false} />
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: generating || query.trim().length < 2, busy: generating }} disabled={generating || query.trim().length < 2} onPress={lookupMeal} style={[styles.generate, (generating || query.trim().length < 2) && styles.disabled]}>
            <Text style={styles.activeText}>{generating ? 'Finding ingredients…' : 'Generate grocery list with AI'}</Text>
          </Pressable>
          <Text style={styles.aiHint}>Enter a meal for an AI suggestion, or choose a saved dish below. Ingredient names only; check your recipe for quantities.</Text>
          {aiError ? <Text accessibilityRole="alert" style={styles.error}>{aiError}</Text> : null}
          <FlatList data={matches} keyExtractor={item => item} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list} ListEmptyComponent={<Text style={styles.subtitle}>No saved dish matches. Try generating its grocery list with AI.</Text>} renderItem={({ item }) => <Pressable accessibilityRole="checkbox" aria-checked={dishes.includes(item)} accessibilityState={{ checked: dishes.includes(item) }} onPress={() => toggleDish(item)} style={[styles.card, dishes.includes(item) && styles.selectedCard]}>
            <View style={styles.cardBody}><Text style={styles.dish}>{item}</Text>{Object.hasOwn(generated, item) && <Text style={styles.aiLabel}>AI suggestion</Text>}<Text style={styles.ingredients}>{availableRecipes[item].join(', ')}</Text></View>
            <Text style={styles.plus}>{dishes.includes(item) ? '✓' : '+'}</Text>
          </Pressable>} />
        </> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
          <Text style={styles.heading}>Your grocery list</Text>
          <Text style={styles.subtitle}>Shared ingredients appear once. Review suggested ingredients and check quantities, servings and dietary needs for your recipe.</Text>
          {groceries.length === 0 && <Text style={styles.empty}>Choose dishes in Meals, or add your own ingredients below.</Text>}
          {groceries.map(item => <Pressable key={item} accessibilityRole="checkbox" aria-checked={checked.includes(item)} accessibilityState={{ checked: checked.includes(item) }} onPress={() => setChecked(current => current.includes(item) ? current.filter(name => name !== item) : [...current, item])} style={styles.grocery}>
            <Text style={styles.box}>{checked.includes(item) ? '☑' : '☐'}</Text><Text style={[styles.groceryText, checked.includes(item) && styles.crossed]}>{item}</Text>
          </Pressable>)}
          <Text style={styles.heading}>Anything else?</Text>
          <Text style={styles.subtitle}>Add ingredients for your own dishes, separated by commas or new lines.</Text>
          <TextInput accessibilityLabel="Extra ingredients" multiline placeholder="potatoes, spinach, olive oil" value={extras} onChangeText={setExtras} style={[styles.input, styles.multiline]} />
          <Pressable accessibilityRole="button" disabled={generating} accessibilityState={{ disabled: generating }} onPress={reset} style={[styles.reset, generating && styles.disabled]}><Text style={styles.resetText}>Start a new list</Text></Pressable>
        </ScrollView>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f3ec', paddingTop: Platform.OS === 'android' ? 32 : 0 },
  container: { flex: 1, width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 20 },
  eyebrow: { color: '#53715c', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { fontSize: 34, fontWeight: '800', color: '#243c30', marginTop: 8 },
  subtitle: { color: '#617267', fontSize: 14, lineHeight: 21, marginVertical: 8 },
  tabs: { flexDirection: 'row', backgroundColor: '#e5e8de', borderRadius: 14, padding: 4, marginVertical: 18 },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#294f38' },
  tabText: { color: '#294f38', fontWeight: '700' }, activeText: { color: '#fff' },
  input: { backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#c8d1c5', borderRadius: 12, padding: 14, fontSize: 16, color: '#243c30', marginBottom: 12 },
  list: { paddingBottom: 32 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e0e4d9', borderRadius: 16, padding: 18, marginBottom: 10 },
  selectedCard: { backgroundColor: '#eaf0df', borderColor: '#53715c' },
  cardBody: { flex: 1 }, dish: { color: '#243c30', fontWeight: '700', fontSize: 17 },
  ingredients: { color: '#617267', fontSize: 13, lineHeight: 19, marginTop: 5 },
  plus: { color: '#294f38', fontSize: 26, marginLeft: 12 },
  heading: { color: '#243c30', fontSize: 21, fontWeight: '700', marginTop: 12 },
  grocery: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#e0e4d9', minHeight: 48 },
  box: { fontSize: 26, color: '#294f38', marginRight: 14 }, groceryText: { flex: 1, fontSize: 17, color: '#243c30' },
  crossed: { textDecorationLine: 'line-through', color: '#617267' },
  multiline: { minHeight: 95, textAlignVertical: 'top', marginTop: 10 },
  empty: { paddingVertical: 24, color: '#617267', lineHeight: 22 },
  reset: { paddingVertical: 16, alignItems: 'center' }, resetText: { color: '#8d3931', fontWeight: '600' },
  error: { color: '#8d3931', marginTop: 8 },
  success: { color: '#294f38', marginTop: 10, lineHeight: 21 },
  generate: { backgroundColor: '#294f38', padding: 15, borderRadius: 12, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  aiHint: { color: '#617267', fontSize: 13, lineHeight: 19, marginVertical: 10 },
  aiLabel: { color: '#53715c', fontSize: 12, marginTop: 4 },
});
