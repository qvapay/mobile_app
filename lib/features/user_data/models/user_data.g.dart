// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_data.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserData _$UserDataFromJson(Map<String, dynamic> json) => UserData(
      uuid: json['uuid'] as String,
      userName: json['username'] as String,
      telegramUserName: json['telegram_user_name'] as String?,
      name: json['name'] as String,
      address: json['address'] as String?,
      phoneNumber: json['phone_number'] as String?,
      email: json['email'] as String,
      lastName: json['lastname'] as String,
      bio: json['bio'] as String,
      logo: json['logo'] as String,
      balance: json['balance'] as String,
      kyc: json['kyc'] as int,
      totalIn: json['total_in'] as String,
      totalOut: json['total_out'] as String,
      latestTransactions: (json['latestTransactions'] as List<dynamic>)
          .map((e) => UserTransaction.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$UserDataToJson(UserData instance) => <String, dynamic>{
      'uuid': instance.uuid,
      'username': instance.userName,
      'telegram_user_name': instance.telegramUserName,
      'address': instance.address,
      'phone_number': instance.phoneNumber,
      'name': instance.name,
      'email': instance.email,
      'lastname': instance.lastName,
      'bio': instance.bio,
      'logo': instance.logo,
      'balance': instance.balance,
      'kyc': instance.kyc,
      'total_in': instance.totalIn,
      'total_out': instance.totalOut,
      'latestTransactions':
          instance.latestTransactions.map((e) => e.toJson()).toList(),
    };
