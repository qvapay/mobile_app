// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_transaction.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserTransaction _$UserTransactionFromJson(Map<String, dynamic> json) =>
    UserTransaction(
      uuid: json['uuid'] as String,
      amount: json['amount'] as String,
      description: json['description'] as String,
      email: json['email'] as String?,
      name: json['name'] as String,
      date: DateTime.parse(json['date'] as String),
      imageUrl: json['image_url'] as String,
      transactionType:
          $enumDecode(_$TransactionTypeEnumMap, json['transaction_type']),
    );

Map<String, dynamic> _$UserTransactionToJson(UserTransaction instance) {
  final val = <String, dynamic>{
    'uuid': instance.uuid,
    'name': instance.name,
  };

  void writeNotNull(String key, dynamic value) {
    if (value != null) {
      val[key] = value;
    }
  }

  writeNotNull('email', instance.email);
  val['amount'] = instance.amount;
  val['description'] = instance.description;
  val['image_url'] = instance.imageUrl;
  val['date'] = instance.date.toIso8601String();
  val['transaction_type'] = _$TransactionTypeEnumMap[instance.transactionType];
  return val;
}

const _$TransactionTypeEnumMap = {
  TransactionType.transfer: 'transfer',
  TransactionType.p2p: 'p2p',
  TransactionType.service: 'service',
  TransactionType.autoRecharge: 'autoRecharge',
  TransactionType.unknown: 'unknown',
};
