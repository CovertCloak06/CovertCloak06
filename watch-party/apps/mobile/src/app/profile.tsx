import { COUNTRIES, countryFlag, servicesForCountry } from '@watch-party/shared/client';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Banner, Body, Button, Chip, Label, Screen } from '@/components/ui';
import { useApp } from '@/lib/app-context';
import { reconcileServices, validateProfile, type Profile } from '@/lib/profile-model';
import { radius, space, usePalette } from '@/lib/theme';

export default function ProfileScreen() {
  const c = usePalette();
  const { profile, updateProfile } = useApp();
  const [draft, setDraft] = useState<Profile>(profile ?? { displayName: '', country: 'US', services: [] });
  const [countryQuery, setCountryQuery] = useState('');
  const [pickingCountry, setPickingCountry] = useState(!profile);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = validateProfile(draft);
  const available = useMemo(() => servicesForCountry(draft.country), [draft.country]);
  const countries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    return q ? COUNTRIES.filter((x) => x.name.toLowerCase().includes(q) || x.code.toLowerCase() === q) : COUNTRIES;
  }, [countryQuery]);
  const countryName = COUNTRIES.find((x) => x.code === draft.country)?.name ?? draft.country;

  const toggleService = (id: string) =>
    setDraft((d) => ({ ...d, services: d.services.includes(id) ? d.services.filter((s) => s !== id) : [...d.services, id] }));

  const save = async () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    await updateProfile({ ...draft, displayName: draft.displayName.trim() });
    setSaving(false);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 17,
    color: c.text,
    backgroundColor: c.card,
  } as const;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl }} keyboardShouldPersistTaps="handled">
        <View>
          <Label>Display name</Label>
          <TextInput
            value={draft.displayName}
            onChangeText={(displayName) => setDraft((d) => ({ ...d, displayName }))}
            placeholder="What friends call you"
            placeholderTextColor={c.muted}
            maxLength={40}
            accessibilityLabel="Display name"
            style={inputStyle}
          />
          {submitted && errors.displayName ? <Text style={{ color: c.danger, marginTop: space.xs }}>{errors.displayName}</Text> : null}
        </View>

        <View>
          <Label>Streaming country</Label>
          <Body muted style={{ marginBottom: space.sm }}>
            The country your accounts are registered in. Catalogs differ per country, so this decides what you can watch.
          </Body>
          {pickingCountry ? (
            <View style={{ gap: space.sm }}>
              <TextInput
                value={countryQuery}
                onChangeText={setCountryQuery}
                placeholder="Search countries"
                placeholderTextColor={c.muted}
                accessibilityLabel="Search countries"
                style={inputStyle}
              />
              <FlatList
                data={countries}
                keyExtractor={(x) => x.code}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: item.code === draft.country }}
                    onPress={() => {
                      setDraft((d) => ({ ...d, country: item.code, services: reconcileServices(item.code, d.services) }));
                      setPickingCountry(false);
                      setCountryQuery('');
                    }}
                    style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: c.border }}
                  >
                    <Text style={{ color: c.text, fontSize: 16, fontWeight: item.code === draft.country ? '800' : '400' }}>
                      {countryFlag(item.code)}  {item.name}
                    </Text>
                  </Pressable>
                )}
              />
            </View>
          ) : (
            <Button label={`${countryFlag(draft.country)}  ${countryName}  ·  change`} variant="secondary" onPress={() => setPickingCountry(true)} />
          )}
        </View>

        <View>
          <Label>Your subscriptions</Label>
          <Body muted style={{ marginBottom: space.sm }}>
            Only subscription plans count. Titles you would have to rent or buy are never suggested.
          </Body>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {available.map((s) => (
              <Chip key={s.id} label={s.name} selected={draft.services.includes(s.id)} onPress={() => toggleService(s.id)} />
            ))}
          </View>
          {submitted && errors.services ? <Text style={{ color: c.danger, marginTop: space.xs }}>{errors.services}</Text> : null}
        </View>

        {submitted && errors.country ? <Banner tone="warning">{errors.country}</Banner> : null}
        <Button label="Save" onPress={save} loading={saving} />
        <Body muted style={{ fontSize: 13 }}>
          You sign in to each streaming service inside its own player screen. Watch Party never sees those passwords.
        </Body>
      </ScrollView>
    </Screen>
  );
}
