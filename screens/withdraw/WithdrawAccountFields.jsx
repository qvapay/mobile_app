import { View, Text } from 'react-native'

import QPInput from '../../ui/particles/QPInput'
import QPPressable from '../../ui/particles/QPPressable'
import { keyFromFieldName } from './withdrawFees'

// Dynamic "account data" inputs driven by the selected coin's working_data fields.
// `type: select` fields render as option chips (the backend validates the value
// against `field.options` and each option can carry a `fee_pct` surcharge, so
// free text would both 400 on submit and hide the real fee). The rest are text
// inputs. `multilineKeys` marks fields (by slugified key) that hold long
// payloads — e.g. the BTCLN wallet field with a BOLT11 invoice — so they wrap
// instead of scrolling, and disable autocapitalize/autocorrect that would
// corrupt them.
const WithdrawAccountFields = ({ workingFields, workingForm, onChangeField, multilineKeys = [], theme, textStyles }) => (
	<View style={{ marginTop: 20 }}>
		<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 10 }]}>Datos de su cuenta:</Text>
		{workingFields.map((field) => {
			const key = keyFromFieldName(field.name)

			if (field.type === 'select' && Array.isArray(field.options) && field.options.length > 0) {
				const current = workingForm[key] || ''
				return (
					<View key={key} style={{ marginVertical: 6 }}>
						<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, marginBottom: 8 }]}>{field.name}:</Text>
						<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
							{field.options.map((opt) => {
								const value = String(opt.value)
								const selected = current === value
								const pct = Number(opt.fee_pct) || 0
								return (
									<QPPressable
										key={value}
										onPress={() => onChangeField(key, value)}
										style={{
											flexDirection: 'row',
											alignItems: 'center',
											gap: 6,
											paddingHorizontal: 12,
											paddingVertical: 7,
											borderRadius: 16,
											backgroundColor: selected ? theme.colors.primary : 'transparent',
											borderWidth: 1,
											borderColor: selected ? theme.colors.primary : theme.colors.border,
										}}
									>
										<Text style={[textStyles.h7, { color: selected ? theme.colors.almostWhite : theme.colors.primaryText }]}>
											{value}
										</Text>
										{pct > 0 && (
											<Text style={[textStyles.caption, { color: selected ? theme.colors.almostWhite : theme.colors.warning }]}>
												+{pct}%
											</Text>
										)}
									</QPPressable>
								)
							})}
						</View>
					</View>
				)
			}

			const isMultiline = multilineKeys.includes(key)
			return (
				<QPInput
					key={key}
					value={workingForm[key] || ''}
					onChangeText={(text) => onChangeField(key, text)}
					placeholder={field.name}
					keyboardType={field.type === 'number' ? 'numeric' : 'default'}
					style={{ marginVertical: 6 }}
					prefixIconName={isMultiline ? 'bolt' : 'id-card'}
					{...(isMultiline && { multiline: true, autoCapitalize: 'none', autoCorrect: false })}
				/>
			)
		})}
	</View>
)

export default WithdrawAccountFields
